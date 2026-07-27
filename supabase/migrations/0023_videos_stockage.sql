-- ---------------------------------------------------------------------------
-- Vidéos de séances hébergées par le club
--
-- Jusqu'ici une séance ne pouvait pointer que vers YouTube (youtube_url).
-- On ajoute video_url : l'URL d'un fichier déposé dans le bucket "videos".
-- Les deux cohabitent — le fichier déposé a la priorité à la lecture.
--
-- Écriture réservée aux admins (is_admin()), lecture ouverte : le bucket est
-- public, comme "avatars" (0008), pour que le <video> du joueur lise l'URL
-- directement sans passer par une URL signée.
-- ---------------------------------------------------------------------------

alter table public.library_sessions
  add column if not exists video_url text not null default '';

-- 200 Mo : plafond du bucket. Le plafond réel reste celui du plan Supabase
-- (50 Mo/fichier en Free) — au-delà, l'upload est rejeté en 413.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  true,
  209715200,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists videos_public_read on storage.objects;
create policy videos_public_read on storage.objects for select
  using (bucket_id = 'videos');

drop policy if exists videos_insert_admin on storage.objects;
create policy videos_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and (select public.is_admin()));

drop policy if exists videos_update_admin on storage.objects;
create policy videos_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'videos' and (select public.is_admin()));

drop policy if exists videos_delete_admin on storage.objects;
create policy videos_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and (select public.is_admin()));
