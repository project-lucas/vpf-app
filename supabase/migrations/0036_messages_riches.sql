-- VPF — Messagerie complète : pièces jointes, vocaux et édition
--
-- La messagerie ne savait envoyer que du texte, définitif. Trois manques que
-- les familles remontent :
--
--  1. Pièces jointes — photo d'une blessure, vidéo d'un geste technique, PDF
--     d'un certificat. Fichiers déposés dans le bucket PRIVÉ `messages` : à la
--     différence des vidéos de la bibliothèque (0023) ou des fiches (0024),
--     publiques par nature, une conversation est confidentielle. Les URL sont
--     signées à la lecture, côté serveur, après que la RLS a prouvé l'accès.
--  2. Vocaux — un message audio est une pièce jointe `audio` comme une autre,
--     avec sa durée pour dessiner le lecteur sans télécharger le fichier.
--  3. Édition — on garde la trace (`edited_at`) plutôt que d'effacer/réécrire :
--     le fil reste lisible et personne ne réécrit l'histoire en douce. Seul
--     l'AUTEUR édite (un admin, lui, peut toujours supprimer — 0033).
--
-- Le corps peut désormais être vide, mais seulement si un fichier l'accompagne
-- (une photo sans légende est un message ; un message sans rien n'en est pas un).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------------

alter table public.conversation_messages
  -- chemin dans le bucket privé `messages` (jamais une URL : elle est signée
  -- à la lecture, et une signature périmée stockée en base ne servirait à rien)
  add column if not exists attachment_path text,
  add column if not exists attachment_kind text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  -- durée en secondes (vocaux et vidéos) : sert à dessiner le lecteur avant
  -- même que le fichier soit chargé
  add column if not exists attachment_duration integer,
  add column if not exists edited_at timestamptz;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_attachment_kind_check;
alter table public.conversation_messages
  add constraint conversation_messages_attachment_kind_check
  check (attachment_kind is null or attachment_kind in ('image', 'video', 'audio', 'file'));

-- Un fichier, c'est un chemin ET une nature — jamais l'un sans l'autre.
alter table public.conversation_messages
  drop constraint if exists conversation_messages_attachment_pair_check;
alter table public.conversation_messages
  add constraint conversation_messages_attachment_pair_check
  check ((attachment_path is null) = (attachment_kind is null));

-- Le corps n'est plus obligatoire (légende facultative d'une photo), mais un
-- message vide de tout reste refusé.
alter table public.conversation_messages
  drop constraint if exists conversation_messages_body_check;
alter table public.conversation_messages
  add constraint conversation_messages_body_check
  check (char_length(body) <= 2000 and (char_length(body) > 0 or attachment_path is not null));

-- ---------------------------------------------------------------------------
-- Édition d'un message
-- ---------------------------------------------------------------------------

-- 0028 avait révoqué tout update. On le rouvre au seul corps du message : ni
-- le canal, ni l'auteur, ni la date d'envoi, ni la pièce jointe ne se
-- réécrivent (remplacer un fichier après coup rendrait le fil intraçable).
grant update (body) on public.conversation_messages to authenticated;

-- `edited_at` est posé par la base, pas par le client : le marqueur « modifié »
-- ne se contourne donc pas (la colonne n'est même pas accordée en écriture).
create or replace function public.touch_message_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.edited_at := now();
  return new;
end;
$fn$;

drop trigger if exists conversation_messages_edited on public.conversation_messages;
create trigger conversation_messages_edited
  before update on public.conversation_messages
  for each row
  when (old.body is distinct from new.body)
  execute function public.touch_message_edited();

-- On n'édite que SES messages, dans un fil auquel on a toujours accès — même
-- audience que la suppression (0034), sans la dérogation admin : modérer, c'est
-- supprimer, pas mettre des mots dans la bouche de quelqu'un.
drop policy if exists conversation_messages_update on public.conversation_messages;
create policy conversation_messages_update on public.conversation_messages
  for update to authenticated
  using (
    sender_id = (select auth.uid())
    and (
      (
        channel_admin_id is null
        and (
          player_id = (select auth.uid())
          or (select public.is_admin())
          or (select public.is_coach_of(player_id))
          or (select public.is_parent_of(player_id))
        )
      )
      or (
        channel_admin_id is not null
        and (player_id = (select auth.uid()) or (select public.is_admin()))
      )
    )
  )
  with check (sender_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bucket privé des pièces jointes
-- ---------------------------------------------------------------------------

-- 50 Mo : plafond du plan Supabase par fichier. Au-delà l'upload part en 413 —
-- l'interface refuse donc en amont (cf. MESSAGE_ATTACHMENT_MAX_BYTES).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages',
  'messages',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'audio/aac', 'audio/x-m4a',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Le chemin d'un fichier est `<player_id>/<uuid>.<ext>` : le premier dossier
-- désigne le fil, et c'est lui qui décide de l'accès. On reste volontairement
-- au niveau du JOUEUR (pas du canal) — le canal, lui, est tranché par la RLS de
-- conversation_messages : sans message associé, un fichier orphelin ne se lit
-- nulle part dans l'application.
create or replace function public.can_access_message_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_player uuid;
begin
  -- chemin malformé (dépôt fabriqué à la main) : accès refusé, pas d'erreur
  begin
    v_player := (storage.foldername(p_name))[1]::uuid;
  exception when others then
    return false;
  end;

  return v_player = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_coach_of(v_player))
    or (select public.is_parent_of(v_player));
end;
$fn$;

drop policy if exists messages_files_read on storage.objects;
create policy messages_files_read on storage.objects for select to authenticated
  using (bucket_id = 'messages' and (select public.can_access_message_file(name)));

drop policy if exists messages_files_insert on storage.objects;
create policy messages_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'messages' and (select public.can_access_message_file(name)));

-- On ne remplace jamais un fichier déjà envoyé : seule la suppression existe
-- (message effacé, ou dépôt annulé avant l'envoi).
drop policy if exists messages_files_delete on storage.objects;
create policy messages_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'messages'
    and ((select public.is_admin()) or owner_id = (select auth.uid())::text)
  );

-- ---------------------------------------------------------------------------
-- Temps réel
-- ---------------------------------------------------------------------------

-- Les fils se rafraîchissaient toutes les 30 s : suffisant pour un pense-bête,
-- pas pour une conversation. On publie la table pour que le fil ouvert réagisse
-- à l'instant (la RLS s'applique aussi au flux temps réel). Le sondage reste en
-- place comme filet — un réseau sans WebSocket ne perd rien.
alter table public.conversation_messages replica identity full;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_messages'
    )
  then
    alter publication supabase_realtime add table public.conversation_messages;
  end if;
end;
$pub$;
