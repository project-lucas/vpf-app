-- VPF — Suivi d'habitudes (heatmap type HabitKit)
-- Le joueur crée ses habitudes personnelles et coche chaque jour réalisé.
-- Le coach référent et l'admin y ont accès en lecture seule.

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '🔥',
  color text not null default 'gold' check (color in ('gold', 'orange', 'yellow')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- pour la FK composite depuis habit_checks (anti-forgerie inter-joueurs)
  unique (id, player_id)
);

create index habits_player_idx on public.habits (player_id, position);

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  player_id uuid not null references public.players (id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, check_date),
  foreign key (habit_id, player_id)
    references public.habits (id, player_id)
    on delete cascade
);

create index habit_checks_player_idx on public.habit_checks (player_id, check_date desc);

-- Date du jour en Europe/Paris (borne les pointages : pas de futur)
create or replace function public.paris_today()
returns date
language sql stable
set search_path = ''
as $$
  select ((now() at time zone 'Europe/Paris'))::date;
$$;

alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;

-- habits : le joueur gère les siennes ; coach référent + admin en lecture
create policy habits_select on public.habits for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy habits_insert on public.habits for insert to authenticated
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy habits_update on public.habits for update to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()))
  with check (player_id = (select auth.uid()) or (select public.is_admin()));

create policy habits_delete on public.habits for delete to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()));

-- habit_checks : cocher/décocher un jour passé ou présent (jamais le futur),
-- au plus un an en arrière
create policy habit_checks_select on public.habit_checks for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy habit_checks_insert on public.habit_checks for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      player_id = (select auth.uid())
      and check_date <= (select public.paris_today())
      and check_date >= (select public.paris_today()) - 365
    )
  );

create policy habit_checks_delete on public.habit_checks for delete to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()));
