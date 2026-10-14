-- VPF — Le brief du matin (couche 2 : passage de Claude à 7h)
--
-- Chaque matin, un appel au modèle Claude lit l'état d'un groupe et écrit un
-- brief : un résumé en quelques phrases et des recommandations (un message
-- prêt à envoyer, une fiche à ouvrir, une visio à proposer…). Le staff le lit
-- dans le volet « Claude » de l'accueil et appuie sur Envoyer : au départ,
-- Claude propose, l'humain valide. L'écriture passe par le service_role
-- (route cron / action admin) ; la lecture suit le staff du groupe.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_briefs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- jour de Paris du brief
  brief_date date not null,
  summary text not null default '',
  -- [{ playerId, title, why, message, action, priority }]
  recommendations jsonb not null default '[]'::jsonb,
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, brief_date)
);

create index if not exists staff_briefs_date_idx on public.staff_briefs (brief_date desc);

alter table public.staff_briefs enable row level security;

drop policy if exists staff_briefs_select on public.staff_briefs;
create policy staff_briefs_select on public.staff_briefs for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.group_staff gs
      where gs.group_id = staff_briefs.group_id and gs.profile_id = (select auth.uid())
    )
  );

revoke all on public.staff_briefs from anon;
revoke insert, update, delete on public.staff_briefs from authenticated;
