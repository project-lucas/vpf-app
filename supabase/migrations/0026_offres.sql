-- VPF — Deux offres commerciales : « perf » et « formation »
--
--  * perf (offre 1, la moins chère) : l'accompagnement de base — planning,
--    dashboard, séances, bilans.
--  * formation (offre 2) : tout ce que contient perf, PLUS les écrans de
--    formation (hygiène de vie, objectifs mesurables).
--
-- L'offre est portée par la fiche joueur et choisie par le COACH (à
-- l'invitation, puis modifiable dans la fiche). Elle n'est jamais dérivée d'un
-- paiement côté app : Stripe vit hors de l'application, le coach fait foi.
--
-- Sécurité : aucun grant client sur la colonne (le revoke de 0002 couvre les
-- colonnes ajoutées ensuite), donc un joueur ne peut pas s'offrir l'offre 2
-- depuis le navigateur. L'écriture passe par le service_role dans les server
-- actions, après vérification que l'appelant est bien le coach référent.
--
-- Changement d'offre : c'est un simple basculement de drapeau, aucune donnée
-- n'est touchée. Un joueur qui repasse en « perf » garde tout son historique
-- (hygiène, objectifs, progression) ; il redevient visible tel quel s'il
-- repasse en « formation ». Le coach, lui, continue de tout voir.
-- ---------------------------------------------------------------------------

create type public.player_offer as enum ('perf', 'formation');

-- default 'formation' : personne ne perd d'accès à l'application de cette
-- migration ; le coach bascule ensuite en « perf » les joueurs concernés.
alter table public.players
  add column offer public.player_offer not null default 'formation';

-- L'offre est choisie dès l'invitation : le joueur arrive avec la bonne
-- interface à sa toute première connexion (signupWithInvitation la recopie
-- sur la fiche joueur créée).
alter table public.invitations
  add column offer public.player_offer not null default 'formation';

-- ---------------------------------------------------------------------------
-- Hygiène de vie : réservée à l'offre formation, verrouillé côté base
-- ---------------------------------------------------------------------------

-- Vrai si l'utilisateur courant est un joueur de l'offre formation.
create or replace function public.is_formation()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where id = auth.uid() and offer = 'formation'::public.player_offer
  );
$$;

-- Écriture (saisie du jour ou d'un jour passé ≤ 1 an) : bornes de 0025 + offre
-- formation. Un joueur perf qui appellerait l'API directement est refusé ici,
-- pas seulement dans l'interface.
drop policy if exists hygiene_logs_insert on public.hygiene_logs;
create policy hygiene_logs_insert on public.hygiene_logs for insert to authenticated
  with check (
    player_id = (select auth.uid())
    and (select public.is_formation())
    and log_date <= (select public.paris_today())
    and log_date >= (select public.paris_today()) - 365
  );

drop policy if exists hygiene_logs_update on public.hygiene_logs;
create policy hygiene_logs_update on public.hygiene_logs for update to authenticated
  using (player_id = (select auth.uid()))
  with check (
    player_id = (select auth.uid())
    and (select public.is_formation())
    and log_date <= (select public.paris_today())
    and log_date >= (select public.paris_today()) - 365
  );

-- La LECTURE reste inchangée (0025) : le joueur repassé en perf ne voit plus
-- l'écran, mais son historique n'est ni supprimé ni rendu illisible — le coach
-- le consulte dans la fiche, et un retour en formation le retrouve intact.
