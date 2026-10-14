-- VPF — Messages automatiques « VPF » et événement « match »
--
-- 1. Un message peut être automatique (`is_system`) : rappel du bilan du
--    dimanche, feuille de match à remplir… Il parle au nom du service, sans
--    auteur, dans le fil Global du joueur, et part en même temps qu'un push :
--    un joueur qui n'a pas activé les notifications le lit quand même.
--    Seul le serveur (service_role) écrit un tel message : la colonne n'est
--    pas dans le grant d'insertion des clients, et un message système n'a
--    jamais d'auteur.
-- 2. Le planning connaît le « match » : c'est lui qui déclenche la feuille de
--    match à remplir (message + pop-up bloquant côté joueur).
-- ---------------------------------------------------------------------------

alter table public.conversation_messages
  add column if not exists is_system boolean not null default false;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_system_sender;
alter table public.conversation_messages
  add constraint conversation_messages_system_sender
  check (not is_system or sender_id is null);

-- insertion client par colonnes : jamais `is_system`
revoke insert on public.conversation_messages from anon, authenticated;
grant insert (
  player_id,
  channel_admin_id,
  sender_id,
  body,
  attachment_path,
  attachment_kind,
  attachment_name,
  attachment_size,
  attachment_duration
) on public.conversation_messages to authenticated;

-- le match, dans la semaine type (utilisable dès la transaction suivante)
alter type public.event_type add value if not exists 'match';
