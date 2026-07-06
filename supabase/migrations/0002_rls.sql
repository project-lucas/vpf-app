-- VPF Centre de Performance — RLS & sécurité des rôles
--
-- Principes :
--  * Helpers SECURITY DEFINER (owner bypass RLS => pas de récursion) avec
--    search_path épinglé, STABLE, appelés en (select fn()) pour être évalués
--    une fois par requête.
--  * Aucune policy = refus. Les flux privilégiés (inscription via invitation,
--    onboarding, archivage, cron, toggle notifications) passent par le
--    service_role côté serveur.
--  * Column grants en complément des policies : impossible d'escalader son
--    rôle ou de changer de coach/statut depuis un client.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.get_role()
returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Vrai si l'utilisateur courant est le coach référent d'un joueur ACTIF :
-- coupe automatiquement tout accès coach aux joueurs archivés.
create or replace function public.is_coach_of(p_player uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where id = p_player and coach_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.get_my_coach_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select coach_id from public.players where id = auth.uid();
$$;

-- Le joueur a-t-il une affectation non retirée de cette séance ?
create or replace function public.has_active_assignment(p_session uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_assignments
    where session_id = p_session
      and player_id = auth.uid()
      and removed_at is null
  );
$$;

-- Lundi de la semaine courante en Europe/Paris (pour borner les pointages)
create or replace function public.paris_week_start()
returns date
language sql stable
set search_path = ''
as $$
  select (date_trunc('week', (now() at time zone 'Europe/Paris')))::date;
$$;

-- ---------------------------------------------------------------------------
-- Activation RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.invitations enable row level security;
alter table public.planned_events enable row level security;
alter table public.event_completions enable row level security;
alter table public.weekly_summaries enable row level security;
alter table public.match_stats enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.checkins enable row level security;
alter table public.library_sessions enable row level security;
alter table public.session_assignments enable row level security;
alter table public.session_completions enable row level security;
alter table public.visible_notes enable row level security;
alter table public.coach_notes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

-- ---------------------------------------------------------------------------
-- Column grants (ceinture + bretelles au-dessus des policies)
-- ---------------------------------------------------------------------------

-- profiles : jamais d'INSERT/DELETE client ; UPDATE limité aux colonnes sûres
-- (role et notifications_enabled sont gérés côté serveur uniquement)
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, whatsapp_number) on public.profiles to authenticated;

-- players : coach_id, status et onboarding_completed inaccessibles aux clients
revoke insert, update, delete on public.players from anon, authenticated;
grant update (position, club, birthdate, height_cm, weight_kg, season_goal)
  on public.players to authenticated;

-- réalisations : seuls le statut et le commentaire sont modifiables
revoke update on public.event_completions from anon, authenticated;
grant update (status, comment) on public.event_completions to authenticated;

revoke update on public.session_completions from anon, authenticated;
grant update (status, comment) on public.session_completions to authenticated;

-- stats match : immuables (aucune correction en V1)
revoke update on public.match_stats from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(id))
    or id = (select public.get_my_coach_id())
  );

create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(id)));

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------

create policy players_select on public.players for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(id))
  );

create policy players_update on public.players for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(id)));

-- ---------------------------------------------------------------------------
-- invitations (admin uniquement ; l'inscription passe par le service_role)
-- ---------------------------------------------------------------------------

create policy invitations_admin on public.invitations for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- planned_events (semaine type) : joueur + coach référent + admin
-- ---------------------------------------------------------------------------

create policy planned_events_select on public.planned_events for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy planned_events_insert on public.planned_events for insert to authenticated
  with check (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy planned_events_update on public.planned_events for update to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  )
  with check (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy planned_events_delete on public.planned_events for delete to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- ---------------------------------------------------------------------------
-- event_completions : le joueur pointe (semaine courante ou précédente),
-- modifie statut/commentaire, ne supprime jamais
-- ---------------------------------------------------------------------------

create policy event_completions_select on public.event_completions for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy event_completions_insert on public.event_completions for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      player_id = (select auth.uid())
      and week_start >= (select public.paris_week_start()) - 7
      and week_start <= (select public.paris_week_start())
      and auto_filled = false
    )
  );

create policy event_completions_update on public.event_completions for update to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()))
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy event_completions_delete on public.event_completions for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- weekly_summaries : lecture seule (écrit par le cron en service_role)
-- ---------------------------------------------------------------------------

create policy weekly_summaries_select on public.weekly_summaries for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- ---------------------------------------------------------------------------
-- match_stats : INSERT + SELECT joueur ; suppression admin uniquement
-- ---------------------------------------------------------------------------

create policy match_stats_select on public.match_stats for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy match_stats_insert on public.match_stats for insert to authenticated
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy match_stats_delete on public.match_stats for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- weekly_reviews (bilan hebdomadaire)
-- ---------------------------------------------------------------------------

create policy weekly_reviews_select on public.weekly_reviews for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy weekly_reviews_insert on public.weekly_reviews for insert to authenticated
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy weekly_reviews_update on public.weekly_reviews for update to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()))
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy weekly_reviews_delete on public.weekly_reviews for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- checkins (pop-up énergie / douleurs)
-- ---------------------------------------------------------------------------

create policy checkins_select on public.checkins for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy checkins_insert on public.checkins for insert to authenticated
  with check (player_id = (select auth.uid()));

create policy checkins_delete on public.checkins for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- library_sessions : un joueur ne voit une séance que via une affectation
-- non retirée (pas de fuite de la bibliothèque ni des URL YouTube)
-- ---------------------------------------------------------------------------

create policy library_sessions_select on public.library_sessions for select to authenticated
  using (
    (select public.is_admin())
    or (select public.get_role()) = 'coach'
    or (select public.has_active_assignment(id))
  );

create policy library_sessions_insert on public.library_sessions for insert to authenticated
  with check ((select public.is_admin()));

create policy library_sessions_update on public.library_sessions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy library_sessions_delete on public.library_sessions for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- session_assignments : le coach affecte/retire/réordonne ; le joueur ne voit
-- que ses affectations non retirées ; le coach garde l'historique complet
-- ---------------------------------------------------------------------------

create policy session_assignments_select on public.session_assignments for select to authenticated
  using (
    (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (player_id = (select auth.uid()) and removed_at is null)
  );

create policy session_assignments_insert on public.session_assignments for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_coach_of(player_id)) and assigned_by = (select auth.uid()))
  );

create policy session_assignments_update on public.session_assignments for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));

create policy session_assignments_delete on public.session_assignments for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- session_completions : un verdict par affectation, jamais supprimé par le joueur
-- ---------------------------------------------------------------------------

create policy session_completions_select on public.session_completions for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy session_completions_insert on public.session_completions for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      player_id = (select auth.uid())
      and exists (
        select 1 from public.session_assignments sa
        where sa.id = assignment_id
          and sa.player_id = (select auth.uid())
          and sa.removed_at is null
      )
    )
  );

create policy session_completions_update on public.session_completions for update to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()))
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy session_completions_delete on public.session_completions for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- visible_notes : écrites par le coach référent / admin, lues par le joueur
-- ---------------------------------------------------------------------------

create policy visible_notes_select on public.visible_notes for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy visible_notes_write on public.visible_notes for insert to authenticated
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));

create policy visible_notes_update on public.visible_notes for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));

create policy visible_notes_delete on public.visible_notes for delete to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

-- ---------------------------------------------------------------------------
-- coach_notes (privées) : coach référent + admin uniquement, rien pour le joueur
-- ---------------------------------------------------------------------------

create policy coach_notes_all on public.coach_notes for all to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));

-- ---------------------------------------------------------------------------
-- push_subscriptions : chacun gère les siennes
-- ---------------------------------------------------------------------------

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- notification_log : écrit par le cron (service_role), lecture admin
-- ---------------------------------------------------------------------------

create policy notification_log_select on public.notification_log for select to authenticated
  using ((select public.is_admin()));
