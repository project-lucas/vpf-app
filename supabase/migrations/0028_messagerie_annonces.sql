-- VPF — Messagerie interne + annonces du club
--
-- 1) Un fil de discussion PAR JOUEUR : le joueur, son coach référent et les
--    admins y écrivent (les parents s'y grefferont en 0029). Messages en clair
--    protégés par la RLS — c'est ce qui permet au staff et à la famille de
--    partager le même fil (contrairement à l'ancienne messagerie chiffrée de
--    bout en bout, supprimée). Pas de modification après envoi ; suppression
--    admin uniquement.
--
-- 2) Annonces du club : publiées par les ADMINS uniquement (lives, événements),
--    ciblées « tous » / « perf » / « formation ». Les joueurs les découvrent
--    via la cloche flottante de leur interface ; le badge non-lu s'appuie sur
--    announcement_reads.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Fil de discussion
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  -- le fil est ancré sur le joueur : un joueur = une conversation
  player_id uuid not null references public.players (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_player_idx
  on public.conversation_messages (player_id, created_at);

-- Dernier passage de chaque participant dans un fil : sert au badge non-lu
-- (messages plus récents que last_read_at et écrits par quelqu'un d'autre).
create table if not exists public.conversation_reads (
  player_id uuid not null references public.players (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (player_id, user_id)
);

alter table public.conversation_messages enable row level security;
alter table public.conversation_reads enable row level security;

-- pas d'édition de message après envoi (quel que soit l'auteur)
revoke update on public.conversation_messages from anon, authenticated;

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- on écrit sous sa propre identité, et uniquement dans un fil auquel on a accès
drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_insert on public.conversation_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      player_id = (select auth.uid())
      or (select public.is_admin())
      or (select public.is_coach_of(player_id))
    )
  );

drop policy if exists conversation_messages_delete on public.conversation_messages;
create policy conversation_messages_delete on public.conversation_messages
  for delete to authenticated
  using ((select public.is_admin()));

-- chacun ne gère que son propre marqueur de lecture, sur un fil accessible
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
    )
  );

-- ---------------------------------------------------------------------------
-- Annonces du club (admins → joueurs, ciblage par offre)
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.announcement_audience as enum ('all', 'perf', 'formation');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  audience public.announcement_audience not null default 'all',
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists announcements_created_idx
  on public.announcements (created_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

-- une annonce publiée ne se modifie pas (on la supprime et on republie)
revoke update on public.announcements from anon, authenticated;

-- Vrai si l'annonce vise l'utilisateur courant en tant que joueur :
-- « tous », ou l'offre portée par sa fiche.
create or replace function public.announcement_targets_me(aud public.announcement_audience)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select aud = 'all'::public.announcement_audience
    or exists (
      select 1 from public.players
      where id = auth.uid() and offer::text = aud::text
    );
$$;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.get_role()) = 'coach'
    or (select public.announcement_targets_me(audience))
  );

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert to authenticated
  with check ((select public.is_admin()) and author_id = (select auth.uid()));

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete to authenticated
  using ((select public.is_admin()));

-- chacun ne marque lues que ses propres lectures, sur une annonce qui le vise
drop policy if exists announcement_reads_own on public.announcement_reads;
create policy announcement_reads_own on public.announcement_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
