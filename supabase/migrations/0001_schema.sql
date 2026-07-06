-- VPF Centre de Performance — Schéma V1
-- Toutes les heures locales sont interprétées en Europe/Paris.
-- Semaine = lundi (week_start) -> dimanche.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('admin', 'coach', 'player');
create type public.player_status as enum ('active', 'archived');
create type public.event_type as enum (
  'entrainement_club',
  'training_basket',
  'prep_physique',
  'mobilite',
  'revision_scolaire',
  'dormir',
  'collation'
);
create type public.completion_status as enum ('done', 'not_done');
create type public.session_pole as enum ('basket', 'physique');
create type public.checkin_question as enum ('energy', 'pain');

-- ---------------------------------------------------------------------------
-- Profils & joueurs
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  first_name text not null default '',
  last_name text not null default '',
  whatsapp_number text not null default '',
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete restrict,
  position text not null default '',
  club text not null default '',
  birthdate date,
  height_cm integer check (height_cm between 100 and 260),
  weight_kg numeric(5, 1) check (weight_kg between 20 and 250),
  season_goal text not null default '',
  status public.player_status not null default 'active',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index players_coach_active_idx on public.players (coach_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Invitations joueur (le PK uuid sert de token à usage unique)
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  player_label text not null default '',
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Planning : semaine type + réalisations hebdomadaires
-- ---------------------------------------------------------------------------

create table public.planned_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  event_type public.event_type not null,
  weekday smallint not null check (weekday between 1 and 7),
  event_time time not null,
  created_at timestamptz not null default now(),
  -- pour la FK composite depuis event_completions (anti-forgerie inter-joueurs)
  unique (id, player_id)
);

create index planned_events_player_idx on public.planned_events (player_id, weekday, event_time);

create table public.event_completions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  planned_event_id uuid,
  week_start date not null check (extract(isodow from week_start) = 1),
  -- snapshot de l'événement au moment du pointage : l'historique survit
  -- aux modifications/suppressions de la semaine type
  event_type public.event_type not null,
  weekday smallint not null check (weekday between 1 and 7),
  event_time time not null,
  status public.completion_status not null,
  comment text not null default '',
  auto_filled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planned_event_id, week_start),
  foreign key (planned_event_id, player_id)
    references public.planned_events (id, player_id)
    on delete set null (planned_event_id)
);

create index event_completions_player_week_idx on public.event_completions (player_id, week_start);

-- Résumés hebdomadaires figés à la clôture (dimanche soir / lundi)
create table public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  planned_count integer not null check (planned_count >= 0),
  done_count integer not null check (done_count >= 0),
  created_at timestamptz not null default now(),
  unique (player_id, week_start)
);

create index weekly_summaries_player_idx on public.weekly_summaries (player_id, week_start desc);

-- ---------------------------------------------------------------------------
-- Statistiques match (immuables pour le joueur)
-- ---------------------------------------------------------------------------

create table public.match_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  match_date date not null,
  points integer not null check (points >= 0),
  minutes integer not null check (minutes between 0 and 60),
  rebounds integer not null check (rebounds >= 0),
  steals integer not null check (steals >= 0),
  created_at timestamptz not null default now()
);

create index match_stats_player_idx on public.match_stats (player_id, match_date desc);

-- ---------------------------------------------------------------------------
-- Bilan hebdomadaire & check-ins (pop-up tous les 5 jours)
-- ---------------------------------------------------------------------------

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  went_well text not null default '',
  to_improve text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, week_start)
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  question public.checkin_question not null,
  score integer not null check (score between 0 and 10),
  created_at timestamptz not null default now()
);

create index checkins_player_idx on public.checkins (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Bibliothèque de séances & affectations
-- ---------------------------------------------------------------------------

create table public.library_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pole public.session_pole not null,
  category text not null,
  youtube_url text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  equipment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (pole = 'basket' and category in
      ('Tir', 'Dribble', 'Passes', 'Finition', 'Footwork', 'Drive', 'Jeu au poste', 'Prise d''écran'))
    or
    (pole = 'physique' and category in
      ('Mobilité', 'Explosivité', 'Endurance', 'Proprioception', 'Kit anti-blessure'))
  )
);

create table public.session_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.library_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  order_index integer not null default 0,
  removed_at timestamptz, -- "retirer" = soft delete : l'historique des réalisations survit
  created_at timestamptz not null default now(),
  unique (id, player_id)
);

create index session_assignments_player_idx on public.session_assignments (player_id, order_index);

create table public.session_completions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique,
  player_id uuid not null references public.players (id) on delete cascade,
  status public.completion_status not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assignment_id, player_id)
    references public.session_assignments (id, player_id)
    on delete cascade
);

-- ---------------------------------------------------------------------------
-- Notes coach
-- ---------------------------------------------------------------------------

-- Note visible par le joueur : une seule note "actuelle" par joueur et par pôle
create table public.visible_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  pole public.session_pole not null,
  content varchar(80) not null,
  updated_at timestamptz not null default now(),
  unique (player_id, pole)
);

-- Notes privées (coach référent + admin) — supprimées à l'archivage du joueur
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index coach_notes_player_idx on public.coach_notes (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications push
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Journal d'envoi : la contrainte unique garantit l'absence de doublons
-- même si deux exécutions du cron se chevauchent
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref_key)
);
