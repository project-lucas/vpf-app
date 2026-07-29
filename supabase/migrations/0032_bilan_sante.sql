-- VPF — Question santé dans le bilan hebdomadaire
-- Le bilan du dimanche demande désormais au joueur comment va son corps :
-- tout va bien / une gêne / une blessure, avec une précision libre optionnelle.
-- L'info remonte au coach dans l'onglet Bilans de la fiche joueur.

alter table public.weekly_reviews
  add column health_status text not null default ''
    check (health_status in ('', 'ok', 'gene', 'blessure')),
  add column health_note text not null default '' check (char_length(health_note) <= 500);

-- Grants colonne par colonne (posés en 0017) : le joueur écrit aussi les deux
-- colonnes santé ; la réponse du coach reste hors de portée des clients.
grant insert (health_status, health_note)
  on public.weekly_reviews to authenticated;
grant update (health_status, health_note)
  on public.weekly_reviews to authenticated;

-- updated_at suit tout changement du contenu JOUEUR (santé comprise), jamais
-- la réponse du coach (0017) — le bilan remonte dans le flux d'activité coach.
create or replace function public.weekly_reviews_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.went_well is distinct from old.went_well
     or new.to_improve is distinct from old.to_improve
     or new.health_status is distinct from old.health_status
     or new.health_note is distinct from old.health_note then
    new.updated_at = now();
  end if;
  return new;
end;
$$;
