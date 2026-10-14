-- VPF — Une pièce jointe appartient à un CANAL, pas à un joueur
--
-- 0036 a posé l'accès au bucket privé `messages` au niveau du joueur : le
-- premier dossier du chemin (`<player_id>/`) décidait de tout, et l'accès était
-- accordé au joueur, aux admins, au coach référent et aux PARENTS.
--
-- Le raisonnement de l'époque — « le canal est tranché par la RLS de
-- conversation_messages : sans message associé, un fichier orphelin ne se lit
-- nulle part dans l'application » — ne tient que si l'accès passe par
-- l'application. L'API storage est directement joignable : la clé anon est
-- publique et la session vit dans les cookies. Un parent pouvait donc lister
-- `<player_id>/` et signer chaque objet, y compris les photos et les vocaux que
-- son enfant avait envoyés dans un FIL PRIVÉ avec le staff — audience dont les
-- parents sont explicitement exclus depuis 0034/0037.
--
-- On fait désormais porter la lecture par le MESSAGE : un fichier se lit si et
-- seulement si son message se lit, avec exactement l'audience de
-- `conversation_messages_select` (0037). Le dépôt, lui, reste au niveau du
-- joueur — le fichier part AVANT le message, il n'a encore rien à quoi se
-- rattacher.
--
-- Aucun changement de chemin : les fichiers déjà déposés restent en place.
-- Aucun impact d'affichage : l'application ne lit jamais le bucket depuis le
-- navigateur, elle passe par des URL signées fabriquées en service_role
-- (`signAttachments`), qui contourne la RLS après que la lecture du message
-- sous RLS a prouvé l'accès au canal.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Dépôt : niveau joueur (inchangé, c'est l'ancien can_access_message_file)
-- ---------------------------------------------------------------------------
-- Qui peut déposer un fichier dans le dossier d'un joueur : le joueur, les
-- admins, son coach référent, ses parents — soit exactement les gens qui
-- peuvent écrire dans au moins un de ses canaux.
create or replace function public.can_upload_message_file(p_name text)
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

-- ---------------------------------------------------------------------------
-- Lecture : niveau canal
-- ---------------------------------------------------------------------------
-- Miroir exact de `conversation_messages_select` (0037). Un fichier sans
-- message — dépôt en cours, ou abandonné avant l'envoi — n'est lisible que par
-- celui qui l'a déposé.
create or replace function public.can_read_message_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    exists (
      select 1
      from public.conversation_messages m
      where m.attachment_path = p_name
        and (
          -- fil global : joueur, admins, coach référent, parents
          (
            m.channel_admin_id is null
            and (
              m.player_id = (select auth.uid())
              or (select public.is_admin())
              or (select public.is_coach_of(m.player_id))
              or (select public.is_parent_of(m.player_id))
            )
          )
          -- fil privé : joueur, admins, porteur du fil. Jamais les parents.
          or (
            m.channel_admin_id is not null
            and (
              m.player_id = (select auth.uid())
              or (select public.is_admin())
              or m.channel_admin_id = (select auth.uid())
            )
          )
        )
    )
    -- dépôt pas encore rattaché à un message : seul le déposant
    or exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'messages'
        and o.name = p_name
        and o.owner_id = (select auth.uid())::text
    );
$fn$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists messages_files_read on storage.objects;
create policy messages_files_read on storage.objects for select to authenticated
  using (bucket_id = 'messages' and (select public.can_read_message_file(name)));

drop policy if exists messages_files_insert on storage.objects;
create policy messages_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'messages' and (select public.can_upload_message_file(name)));

-- La suppression est inchangée (0036) : l'admin, ou le propriétaire de l'objet.

-- L'ancienne fonction n'est plus référencée par aucune policy.
drop function if exists public.can_access_message_file(text);
