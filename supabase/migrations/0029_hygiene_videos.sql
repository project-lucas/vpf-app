-- VPF — Vidéothèque Hygiène de vie
--
-- Base de vidéos éducatives (sommeil, nutrition, récupération…) créée et
-- entretenue par les ADMINS dans la Bibliothèque. Les coachs (et admins)
-- activent ensuite la visibilité vidéo par vidéo pour chaque joueur :
-- « Yanis, tu as un problème de sommeil — va dans l'onglet Hygiène de vie,
-- je t'ai envoyé une vidéo. »
--
-- Réservé à l'offre formation (seule à porter l'onglet Hygiène de vie) :
-- verrouillé ici en base, pas seulement dans l'interface.
--
-- Même logique que la bibliothèque de séances (0002) : un joueur ne voit une
-- vidéo que s'il y est affecté — pas de fuite du catalogue ni des URL.
-- ---------------------------------------------------------------------------

create table if not exists public.hygiene_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  url text not null check (char_length(url) between 1 and 500),
  -- catégorie libre (Sommeil, Nutrition…) — liste suggérée côté app
  category text not null default '',
  description text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hygiene_video_assignments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.hygiene_videos (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- l'activation est un simple interrupteur : une ligne = visible, pas de doublon
  unique (video_id, player_id)
);

create index if not exists hygiene_video_assignments_player_idx
  on public.hygiene_video_assignments (player_id);

alter table public.hygiene_videos enable row level security;
alter table public.hygiene_video_assignments enable row level security;

-- Le joueur a-t-il cette vidéo activée ?
create or replace function public.has_hygiene_video(p_video uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hygiene_video_assignments
    where video_id = p_video and player_id = auth.uid()
  );
$$;

-- Vidéos : catalogue entier pour le staff, uniquement les vidéos activées
-- pour un joueur ; création / retouche / suppression admin uniquement.
drop policy if exists hygiene_videos_select on public.hygiene_videos;
create policy hygiene_videos_select on public.hygiene_videos
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.get_role()) = 'coach'
    or (select public.has_hygiene_video(id))
  );

drop policy if exists hygiene_videos_insert on public.hygiene_videos;
create policy hygiene_videos_insert on public.hygiene_videos
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists hygiene_videos_update on public.hygiene_videos;
create policy hygiene_videos_update on public.hygiene_videos
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists hygiene_videos_delete on public.hygiene_videos;
create policy hygiene_videos_delete on public.hygiene_videos
  for delete to authenticated
  using ((select public.is_admin()));

-- Activations : le coach référent / l'admin gèrent, le joueur voit les siennes.
-- L'insert exige un joueur de l'offre formation — un joueur perf n'a pas
-- l'onglet Hygiène de vie, on n'y range rien pour lui.
drop policy if exists hygiene_video_assignments_select on public.hygiene_video_assignments;
create policy hygiene_video_assignments_select on public.hygiene_video_assignments
  for select to authenticated
  using (
    player_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(player_id))
  );

drop policy if exists hygiene_video_assignments_insert on public.hygiene_video_assignments;
create policy hygiene_video_assignments_insert on public.hygiene_video_assignments
  for insert to authenticated
  with check (
    ((select public.is_admin()) or (select public.is_coach_of(player_id)))
    and assigned_by = (select auth.uid())
    and exists (
      select 1 from public.players
      where id = player_id and offer = 'formation'::public.player_offer
    )
  );

drop policy if exists hygiene_video_assignments_delete on public.hygiene_video_assignments;
create policy hygiene_video_assignments_delete on public.hygiene_video_assignments
  for delete to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)));

drop trigger if exists set_updated_at on public.hygiene_videos;
create trigger set_updated_at before update on public.hygiene_videos
  for each row execute function public.set_updated_at();
