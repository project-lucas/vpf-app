-- VPF — Jarvis prépare, le staff valide (couche 3)
--
-- Deux tables écrites par le passage de Jarvis (service_role, route cron
-- /api/cron/jarvis ou « Préparer maintenant ») et lues par le staff :
--
--  * jarvis_drafts — les brouillons à valider dans la file « Aujourd'hui » :
--    réponse à un bilan, message proposant une visio (décrochage), rapport
--    mensuel aux parents. Un brouillon par (nature, joueur, période) ; le staff
--    le valide (il part par l'action existante), le passe ou le corrige.
--  * player_memories — la fiche mémoire d'un joueur : cinq lignes tenues à
--    jour chaque semaine, pour que n'importe quel coach le reprenne en 30 s.
--    Jamais visible du joueur ni des parents.
--
-- Rien n'est écrit vers un joueur depuis ces tables : Jarvis propose, le staff
-- envoie.
-- ---------------------------------------------------------------------------

create table if not exists public.jarvis_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('review_reply', 'visio', 'parent_report')),
  player_id uuid not null references public.players (id) on delete cascade,
  -- le bilan auquel répond un brouillon `review_reply`
  review_id uuid references public.weekly_reviews (id) on delete cascade,
  -- semaine (lundi, AAAA-MM-JJ) ou mois (AAAA-MM) concerné
  period text not null,
  body text not null default '',
  -- pourquoi Jarvis le propose, en une phrase (lu par le staff, jamais envoyé)
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'dismissed', 'error')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  model text not null default '',
  created_at timestamptz not null default now(),
  unique (kind, player_id, period)
);

create index if not exists jarvis_drafts_pending_idx
  on public.jarvis_drafts (status, kind, created_at desc);

alter table public.jarvis_drafts enable row level security;

drop policy if exists jarvis_drafts_select on public.jarvis_drafts;
create policy jarvis_drafts_select on public.jarvis_drafts for select to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

revoke all on public.jarvis_drafts from anon;
revoke insert, update, delete on public.jarvis_drafts from authenticated;

create table if not exists public.player_memories (
  player_id uuid primary key references public.players (id) on delete cascade,
  -- { situation, works, blocks, promised, watch } — une phrase chacun
  sections jsonb not null default '{}'::jsonb,
  -- dernier échec du passage (le joueur est retenté la semaine suivante)
  error text,
  model text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.player_memories enable row level security;

drop policy if exists player_memories_select on public.player_memories;
create policy player_memories_select on public.player_memories for select to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

revoke all on public.player_memories from anon;
revoke insert, update, delete on public.player_memories from authenticated;
