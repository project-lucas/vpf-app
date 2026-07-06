-- VPF Centre de Performance — Triggers

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.event_completions
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.session_completions
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.visible_notes
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.library_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Archivage d'un joueur : suppression automatique des notes privées coach.
-- Trigger DB (et non logique applicative) pour que l'invariant "un joueur
-- archivé ne conserve pas les notes coach" soit impossible à contourner.
-- ---------------------------------------------------------------------------

create or replace function public.handle_player_archived()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status = 'active' then
    delete from public.coach_notes where player_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_player_archived after update of status on public.players
  for each row execute function public.handle_player_archived();
