-- VPF — Groupes, prise en charge du brief, journal du staff
--
-- Le service passe en mode « par groupe » : un groupe = un staff à plusieurs
-- (les deux admins sur le groupe A, un coach technique demain). Le coach
-- référent (`players.coach_id`) reste : c'est le responsable du joueur dans
-- son groupe (fils privés, notifications, « mes joueurs »). Le staff du
-- groupe voit et agit sur tous les joueurs du groupe — `is_coach_of` est
-- élargi en conséquence, toutes les policies existantes en héritent.
--
-- Deux tables de travail pour l'accueil : `task_claims` (« Je prends » — qui
-- s'occupe de quel joueur aujourd'hui, pour que deux admins ne fassent pas
-- deux fois la même chose) et `staff_journal` (« qui a fait quoi » — le staff,
-- et demain le passage automatique du matin, au même niveau).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Groupes et leur staff
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  -- ordre d'affichage (A, B, C…)
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.group_staff (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

alter table public.players
  add column if not exists group_id uuid references public.groups (id) on delete set null;

create index if not exists players_group_active_idx
  on public.players (group_id) where status = 'active';

-- Un joueur sans groupe rejoint le premier groupe (par position) : un compte
-- créé par invitation arrive donc d'office dans le groupe A.
create or replace function public.set_default_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is null then
    select id into new.group_id
    from public.groups
    order by position, created_at
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists players_default_group on public.players;
create trigger players_default_group
  before insert on public.players
  for each row execute function public.set_default_group();

-- Groupe A : tous les joueurs actuels, encadrés par les admins.
insert into public.groups (id, name, position)
values ('a0000000-0000-4000-8000-000000000001', 'Groupe A', 0)
on conflict (id) do nothing;

insert into public.group_staff (group_id, profile_id)
select 'a0000000-0000-4000-8000-000000000001', id
from public.profiles
where role = 'admin'
on conflict do nothing;

update public.players
set group_id = 'a0000000-0000-4000-8000-000000000001'
where group_id is null;

-- `group_id` n'est pas dans le grant update de `players` (0002) : comme
-- `coach_id`, l'affectation passe par le service_role après vérification admin.

-- ---------------------------------------------------------------------------
-- Accès : le staff d'un groupe est « coach » de ses joueurs
-- ---------------------------------------------------------------------------

create or replace function public.is_coach_of(p_player uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.id = p_player
      and p.status = 'active'
      and (
        p.coach_id = auth.uid()
        or exists (
          select 1 from public.group_staff gs
          where gs.group_id = p.group_id and gs.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('coach', 'admin')
  );
$$;

alter table public.groups enable row level security;
alter table public.group_staff enable row level security;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using ((select public.is_staff()));

drop policy if exists groups_admin_write on public.groups;
create policy groups_admin_write on public.groups for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists group_staff_select on public.group_staff;
create policy group_staff_select on public.group_staff for select to authenticated
  using ((select public.is_staff()));

drop policy if exists group_staff_admin_write on public.group_staff;
create policy group_staff_admin_write on public.group_staff for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- « Je prends » : une prise en charge par (joueur, nature, référence).
-- Le brief du jour utilise kind = 'brief' et ref_key = la date de Paris :
-- « je m'occupe de ce joueur aujourd'hui ». Reprendre une ligne déjà prise la
-- réattribue (deux admins, on se fait confiance).
-- ---------------------------------------------------------------------------

create table if not exists public.task_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  ref_key text not null default '',
  claimed_by uuid not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (player_id, kind, ref_key)
);

alter table public.task_claims enable row level security;

drop policy if exists task_claims_select on public.task_claims;
create policy task_claims_select on public.task_claims for select to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

drop policy if exists task_claims_insert on public.task_claims;
create policy task_claims_insert on public.task_claims for insert to authenticated
  with check (
    claimed_by = (select auth.uid())
    and ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  );

drop policy if exists task_claims_update on public.task_claims;
create policy task_claims_update on public.task_claims for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check (claimed_by = (select auth.uid()));

drop policy if exists task_claims_delete on public.task_claims;
create policy task_claims_delete on public.task_claims for delete to authenticated
  using (claimed_by = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Journal du staff : qui a fait quoi. Écrit côté serveur (service_role) par
-- les actions ; demain par le passage automatique (actor_kind = 'claude').
-- `summary` est la phrase sans son sujet (« a répondu au bilan de Théo »).
-- ---------------------------------------------------------------------------

create table if not exists public.staff_journal (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_kind text not null default 'staff' check (actor_kind in ('staff', 'claude', 'system')),
  player_id uuid references public.players (id) on delete cascade,
  action text not null check (char_length(action) between 1 and 40),
  summary text not null default '' check (char_length(summary) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists staff_journal_created_idx on public.staff_journal (created_at desc);

alter table public.staff_journal enable row level security;

drop policy if exists staff_journal_select on public.staff_journal;
create policy staff_journal_select on public.staff_journal for select to authenticated
  using (
    (select public.is_admin())
    or actor_id = (select auth.uid())
    or (player_id is not null and (select public.is_coach_of(player_id)))
  );
