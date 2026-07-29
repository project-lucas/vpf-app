-- VPF — Rôle « parent » (2/2) : liens, invitations, accès en lecture
--
--  * parent_links : un compte parent ↔ un joueur (2 parents max par joueur,
--    borne appliquée côté serveur à l'invitation). Écritures via service_role
--    uniquement (création à l'inscription, retrait par le coach/l'admin).
--  * parent_invitations : liens à usage unique créés par le coach référent ou
--    l'admin depuis la fiche du joueur, consommés en service_role comme les
--    invitations joueur.
--  * is_parent_of : helper au même modèle qu'is_coach_of (joueur ACTIF — un
--    joueur archivé disparaît aussi pour ses parents).
--  * Le parent LIT : fiche, planning, pointages, résumés hebdo, stats match,
--    objectifs, hygiène, focus de la semaine. Il ÉCRIT uniquement dans le fil
--    de discussion. Pas d'accès aux notes privées, bilans, annonces.
-- ---------------------------------------------------------------------------

create table if not exists public.parent_links (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- un compte parent = un enfant (le cas fratrie = un compte par enfant)
  primary key (parent_id),
  unique (parent_id, player_id)
);

create index if not exists parent_links_player_idx on public.parent_links (player_id);

create table if not exists public.parent_invitations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  label text not null default '',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null
);

create index if not exists parent_invitations_player_idx
  on public.parent_invitations (player_id);

alter table public.parent_links enable row level security;
alter table public.parent_invitations enable row level security;

-- Vrai si l'utilisateur courant est parent d'un joueur ACTIF donné.
create or replace function public.is_parent_of(p_player uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parent_links pl
    join public.players p on p.id = pl.player_id
    where pl.parent_id = auth.uid()
      and pl.player_id = p_player
      and p.status = 'active'
  );
$$;

-- liens : lisibles par le parent lui-même, le coach référent et l'admin ;
-- aucune écriture client (service_role uniquement)
drop policy if exists parent_links_select on public.parent_links;
create policy parent_links_select on public.parent_links
  for select to authenticated
  using (
    parent_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- invitations parent : le coach référent et l'admin les consultent depuis la
-- fiche ; création / consommation en service_role
drop policy if exists parent_invitations_select on public.parent_invitations;
create policy parent_invitations_select on public.parent_invitations
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

-- ---------------------------------------------------------------------------
-- Extension des policies de lecture : + le parent du joueur
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(id))
    or id = (select public.get_my_coach_id())
    or (select public.is_parent_of(id))
  );

drop policy if exists players_select on public.players;
create policy players_select on public.players for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(id))
    or (select public.is_parent_of(id))
  );

drop policy if exists planned_events_select on public.planned_events;
create policy planned_events_select on public.planned_events for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists event_completions_select on public.event_completions;
create policy event_completions_select on public.event_completions for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists weekly_summaries_select on public.weekly_summaries;
create policy weekly_summaries_select on public.weekly_summaries for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists match_stats_select on public.match_stats;
create policy match_stats_select on public.match_stats for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists player_goals_select on public.player_goals;
create policy player_goals_select on public.player_goals for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists hygiene_logs_select on public.hygiene_logs;
create policy hygiene_logs_select on public.hygiene_logs for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists coach_focus_select on public.coach_focus;
create policy coach_focus_select on public.coach_focus for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

-- ---------------------------------------------------------------------------
-- Fil de discussion : le parent lit ET écrit
-- ---------------------------------------------------------------------------

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (select public.is_parent_of(player_id))
  );

drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_insert on public.conversation_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      player_id = (select auth.uid())
      or (select public.is_admin())
      or (select public.is_coach_of(player_id))
      or (select public.is_parent_of(player_id))
    )
  );

drop policy if exists conversation_reads_own on public.conversation_reads;
create policy conversation_reads_own on public.conversation_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      player_id = (select auth.uid())
      or (select public.is_admin())
      or (select public.is_coach_of(player_id))
      or (select public.is_parent_of(player_id))
    )
  );
