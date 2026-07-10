-- VPF — Objectifs mesurables du joueur
-- Fixés avec le coach (« 70 % aux lancers francs d'ici décembre ») : un titre,
-- une cible chiffrée, une progression mise à jour par le coach. Le joueur voit
-- la jauge sur son dashboard ; l'objectif de saison libre (players.season_goal)
-- reste le cap général, ces objectifs en sont les étapes concrètes.

create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  title text not null,
  target_value numeric(8, 1) not null check (target_value > 0),
  current_value numeric(8, 1) not null default 0 check (current_value >= 0),
  unit text not null default '',
  deadline date,
  achieved_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_goals_player_idx on public.player_goals (player_id, created_at desc);

alter table public.player_goals enable row level security;

create policy player_goals_select on public.player_goals for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- définis et mis à jour par le coach référent / l'admin uniquement : le joueur
-- ne peut pas gonfler sa propre progression
create policy player_goals_insert on public.player_goals for insert to authenticated
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));

create policy player_goals_update on public.player_goals for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));

create policy player_goals_delete on public.player_goals for delete to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

create trigger set_updated_at before update on public.player_goals
  for each row execute function public.set_updated_at();
