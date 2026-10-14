-- VPF — La feuille de match du week-end : la réponse du joueur
--
-- Chaque week-end (samedi 18 h), l'espace joueur s'ouvre sur la feuille de
-- match. Trois sorties sans saisie, à enregistrer pour ne plus redemander :
--   * 'not_played' — le joueur n'a pas joué ;
--   * 'tomorrow'   — son match est demain : on redemande le dimanche 18 h,
--                    en même temps que le bilan ;
--   * 'no_match'   — pas de match ce week-end.
-- Une feuille saisie (match_stats) vaut réponse. Une ligne par (joueur,
-- semaine) ; 'tomorrow' se remplace par la réponse finale du dimanche.
-- ---------------------------------------------------------------------------

create table if not exists public.match_weekend_answers (
  player_id uuid not null references public.players (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  answer text not null check (answer in ('not_played', 'tomorrow', 'no_match')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, week_start)
);

drop trigger if exists set_updated_at on public.match_weekend_answers;
create trigger set_updated_at before update on public.match_weekend_answers
  for each row execute function public.set_updated_at();

alter table public.match_weekend_answers enable row level security;

drop policy if exists match_weekend_answers_select on public.match_weekend_answers;
create policy match_weekend_answers_select on public.match_weekend_answers
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

-- le joueur répond pour lui-même ; le staff ne répond pas à sa place
drop policy if exists match_weekend_answers_insert on public.match_weekend_answers;
create policy match_weekend_answers_insert on public.match_weekend_answers
  for insert to authenticated
  with check (player_id = (select auth.uid()));

drop policy if exists match_weekend_answers_update on public.match_weekend_answers;
create policy match_weekend_answers_update on public.match_weekend_answers
  for update to authenticated
  using (player_id = (select auth.uid()))
  with check (player_id = (select auth.uid()));

revoke all on public.match_weekend_answers from anon;
revoke delete on public.match_weekend_answers from authenticated;
