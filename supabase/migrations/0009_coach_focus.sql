-- Focus de la semaine écrit par le coach, affiché en tête du planning joueur.
-- Une seule consigne active par joueur ; écrite/modifiée par le coach référent
-- (ou l'admin), lisible par le joueur.

create table public.coach_focus (
  player_id uuid primary key references public.players (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 200),
  updated_at timestamptz not null default now()
);

alter table public.coach_focus enable row level security;

create policy coach_focus_select on public.coach_focus for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

create policy coach_focus_write on public.coach_focus for all to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));
