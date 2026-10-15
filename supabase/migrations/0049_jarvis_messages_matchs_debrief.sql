-- VPF — Jarvis prépare aussi les réponses aux messages, les retours de match
-- et le debrief du week-end (15/10/2026)
--
--  * jarvis_drafts accepte deux nouvelles natures :
--      - `message_reply` : réponse à un message de la famille resté sans
--        réponse du staff. `period` = id du message auquel on répond,
--        `channel` = le fil où la réponse partira.
--      - `match_reply` : retour du coach sur une feuille de match.
--        `period` = id de la feuille (match_stats).
--  * weekend_debriefs : le debrief du lundi, un par groupe et par semaine,
--    écrit par Jarvis (service_role), lu par le staff du groupe et les admins.
-- ---------------------------------------------------------------------------

alter table public.jarvis_drafts
  drop constraint if exists jarvis_drafts_kind_check;
alter table public.jarvis_drafts
  add constraint jarvis_drafts_kind_check
  check (kind in ('review_reply', 'visio', 'parent_report', 'message_reply', 'match_reply'));

alter table public.jarvis_drafts
  add column if not exists channel text not null default 'global';

create table if not exists public.weekend_debriefs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- lundi de la semaine qui commence (le week-end couvert est celui d'avant)
  week_start date not null check (extract(isodow from week_start) = 1),
  summary text not null default '',
  -- { matches: [{playerId, text}], watch: [{playerId, text}], actions: [text] }
  sections jsonb not null default '{}'::jsonb,
  model text not null default '',
  created_at timestamptz not null default now(),
  unique (group_id, week_start)
);

alter table public.weekend_debriefs enable row level security;

drop policy if exists weekend_debriefs_select on public.weekend_debriefs;
create policy weekend_debriefs_select on public.weekend_debriefs for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.group_staff gs
      where gs.group_id = weekend_debriefs.group_id and gs.profile_id = (select auth.uid())
    )
  );

revoke all on public.weekend_debriefs from anon;
revoke insert, update, delete on public.weekend_debriefs from authenticated;
