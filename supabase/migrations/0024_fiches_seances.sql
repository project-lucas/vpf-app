-- ---------------------------------------------------------------------------
-- Fiche de training d'une séance (image)
--
-- Chaque séance peut porter une fiche : l'image du programme papier, affichée
-- au joueur à côté de la vidéo. L'ordre d'affichage dépend du pôle et est géré
-- côté UI (physique : fiche puis vidéo ; technique/routine : vidéo puis fiche).
--
-- Écriture réservée aux admins (is_admin()), lecture ouverte : le bucket est
-- public, comme "avatars" (0008) et "videos" (0023), pour que le <img> du
-- joueur lise l'URL directement sans passer par une URL signée.
-- ---------------------------------------------------------------------------

alter table public.library_sessions
  add column if not exists sheet_url text not null default '';

-- 10 Mo : une fiche est une image (photo ou export d'un visuel), pas une vidéo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiches',
  'fiches',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fiches_public_read on storage.objects;
create policy fiches_public_read on storage.objects for select
  using (bucket_id = 'fiches');

drop policy if exists fiches_insert_admin on storage.objects;
create policy fiches_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'fiches' and (select public.is_admin()));

drop policy if exists fiches_update_admin on storage.objects;
create policy fiches_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'fiches' and (select public.is_admin()));

drop policy if exists fiches_delete_admin on storage.objects;
create policy fiches_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'fiches' and (select public.is_admin()));
