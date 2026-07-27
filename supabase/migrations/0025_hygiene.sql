-- VPF — Hygiène de vie (sommeil, hydratation, nutrition)
--
-- Une ligne par joueur et par jour : le joueur note chaque jour ses heures de
-- sommeil de la veille et quatre notes sur 5 (hydratation, glucides, protéines,
-- vitamines). L'écran /hygiene en tire un radar de moyennes sur l'historique.
--
-- Le sommeil n'est PAS noté : il reste une durée (« 7h30 »), restituée telle
-- quelle en moyenne d'heures. Seuls les quatre critères d'hygiène alimentaire
-- ont une note sur 5 et forment le radar.
--
-- Écriture réservée au joueur lui-même (pas de note gonflée par un tiers),
-- lecture ouverte au coach référent et à l'admin comme les habitudes (0004).
-- ---------------------------------------------------------------------------

create table if not exists public.hygiene_logs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  -- jour noté ; le sommeil correspond à la nuit précédant ce jour
  log_date date not null,
  sleep_hours numeric(3, 1) not null check (sleep_hours >= 0 and sleep_hours <= 16),
  hydration smallint not null check (hydration between 1 and 5),
  carbs smallint not null check (carbs between 1 and 5),
  proteins smallint not null check (proteins between 1 and 5),
  vitamins smallint not null check (vitamins between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- une seule saisie par jour : la re-saisie du jour écrase la précédente
  unique (player_id, log_date)
);

create index if not exists hygiene_logs_player_idx
  on public.hygiene_logs (player_id, log_date desc);

alter table public.hygiene_logs enable row level security;

drop policy if exists hygiene_logs_select on public.hygiene_logs;
create policy hygiene_logs_select on public.hygiene_logs for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- Saisie du jour ou d'un jour passé (≤ 1 an), jamais du futur — mêmes bornes
-- que les pointages d'habitudes (0004), appliquées côté base.
drop policy if exists hygiene_logs_insert on public.hygiene_logs;
create policy hygiene_logs_insert on public.hygiene_logs for insert to authenticated
  with check (
    player_id = (select auth.uid())
    and log_date <= (select public.paris_today())
    and log_date >= (select public.paris_today()) - 365
  );

drop policy if exists hygiene_logs_update on public.hygiene_logs;
create policy hygiene_logs_update on public.hygiene_logs for update to authenticated
  using (player_id = (select auth.uid()))
  with check (
    player_id = (select auth.uid())
    and log_date <= (select public.paris_today())
    and log_date >= (select public.paris_today()) - 365
  );

drop policy if exists hygiene_logs_delete on public.hygiene_logs;
create policy hygiene_logs_delete on public.hygiene_logs for delete to authenticated
  using (player_id = (select auth.uid()) or (select public.is_admin()));

drop trigger if exists set_updated_at on public.hygiene_logs;
create trigger set_updated_at before update on public.hygiene_logs
  for each row execute function public.set_updated_at();
