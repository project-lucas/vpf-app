-- VPF — Le programme se range par jour de la semaine
--
-- Jusqu'ici les séances affectées à un joueur formaient une liste plate,
-- filtrée par pôle : un programme d'été chargé (plusieurs techniques, deux
-- routines, une prépa physique) obligeait à faire défiler trois onglets pour
-- savoir quoi faire aujourd'hui.
--
-- Chaque affectation porte désormais un JOUR (1 = lundi … 7 = dimanche), au
-- même format que `planned_events.weekday`. L'onglet Programme s'ouvre sur le
-- jour courant et le planning renvoie vers les séances du jour.
--
-- La séance reste un travail à faire UNE fois : le jour la range, il ne la
-- fait pas revenir chaque semaine. `session_completions` est inchangée.
--
-- Colonne nullable en base (le rattrapage ci-dessous ne peut pas tout deviner)
-- mais OBLIGATOIRE à l'affectation : les actions serveur refusent une séance
-- sans jour, et le coach voit celles qui restent à replacer dans la fiche.
-- ---------------------------------------------------------------------------

alter table public.session_assignments
  add column if not exists weekday smallint check (weekday between 1 and 7);

-- l'écran joueur lit « les séances de ce joueur, ce jour-là, dans l'ordre »
create index if not exists session_assignments_day_idx
  on public.session_assignments (player_id, weekday, order_index);

-- ---------------------------------------------------------------------------
-- Rattrapage des séances déjà affectées
-- ---------------------------------------------------------------------------
-- Sans jour, une séance existante disparaîtrait de l'écran du joueur. On la
-- range sur le jour où il a DÉJÀ la tâche correspondante dans sa semaine type
-- (prépa physique, entraînement, mobilité) — c'est exactement le lien que
-- l'écran cherche à rendre visible. Le jour le plus tôt gagne quand il y en a
-- plusieurs ; le coach redistribue ensuite depuis la fiche joueur.
--
-- Ce qui ne trouve aucun jour reste NULL : invisible côté joueur, signalé
-- « à replacer » côté coach. Volontairement non idempotent au sens strict —
-- le where NULL fait que rejouer la migration ne touche plus rien.
update public.session_assignments sa
set weekday = (
  select min(pe.weekday)
  from public.planned_events pe
  join public.library_sessions ls on ls.id = sa.session_id
  where pe.player_id = sa.player_id
    and (
      (ls.pole = 'physique' and pe.event_type = 'prep_physique')
      or (ls.pole = 'basket' and pe.event_type in ('training_basket', 'entrainement_club'))
      or (ls.pole = 'routine' and pe.event_type = 'mobilite')
    )
)
where sa.weekday is null
  and sa.removed_at is null;
