-- VPF — Des fils par RÔLE, comme des groupes WhatsApp
--
-- Jusqu'ici (0034/0037) un joueur avait le fil global et un fil privé par
-- « porteur » (chaque admin, son coach référent), en offre formation seulement.
-- Le service travaille désormais par rôles, pour toutes les offres :
--
--   global     joueur + parents + tout le staff (inchangé)
--   technique  joueur + le coach TECHNIQUE de son groupe + admins
--   physique   joueur + le coach PHYSIQUE de son groupe + admins
--   referent   joueur + son coach référent (players.coach_id) + admins
--   parents    parents + tout le staff du joueur + admins — SANS le joueur
--              (les rapports du 28 partent ici)
--   legacy     ancien fil privé d'un admin qui n'est pas le référent :
--              lecture seule, joueur + admins + l'ancien porteur
--
-- Un fil appartient au RÔLE, pas à la personne : quand le coach technique
-- d'un groupe change, le nouveau reprend le fil avec son historique.
-- Le rôle technique / physique se pose sur le staff du groupe (group_staff.role).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Rôle dans le staff d'un groupe
-- ---------------------------------------------------------------------------

alter table public.group_staff
  add column if not exists role text check (role in ('technique', 'physique'));

-- un seul coach technique et un seul coach physique par groupe
create unique index if not exists group_staff_role_uk
  on public.group_staff (group_id, role)
  where role is not null;

-- ---------------------------------------------------------------------------
-- Canal des messages
-- ---------------------------------------------------------------------------

alter table public.conversation_messages
  add column if not exists channel text not null default 'global'
  check (channel in ('global', 'technique', 'physique', 'referent', 'parents', 'legacy'));

-- les anciens fils privés : celui du référent devient le fil Référent, les
-- autres sont gardés en lecture seule
update public.conversation_messages m
set channel = case when m.channel_admin_id = p.coach_id then 'referent' else 'legacy' end
from public.players p
where p.id = m.player_id
  and m.channel_admin_id is not null
  and m.channel = 'global';

-- Un fil par rôle n'appartient plus à une personne : sans ça, supprimer le
-- compte de l'ancien référent effacerait l'historique du fil (cascade).
update public.conversation_messages set channel_admin_id = null
where channel <> 'legacy' and channel_admin_id is not null;

create index if not exists conversation_messages_role_channel_idx
  on public.conversation_messages (player_id, channel, created_at);

-- Compatibilité le temps du déploiement : un ancien client qui écrit encore
-- un fil privé par `channel_admin_id` est rangé dans le bon canal.
create or replace function public.conversation_messages_channel_compat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.channel = 'global' and new.channel_admin_id is not null then
    if exists (select 1 from public.players where id = new.player_id and coach_id = new.channel_admin_id) then
      new.channel := 'referent';
      new.channel_admin_id := null;
    else
      new.channel := 'legacy';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists conversation_messages_channel_compat on public.conversation_messages;
create trigger conversation_messages_channel_compat
  before insert on public.conversation_messages
  for each row execute function public.conversation_messages_channel_compat();

-- ---------------------------------------------------------------------------
-- Marqueurs de lecture par canal
-- ---------------------------------------------------------------------------

alter table public.conversation_reads
  add column if not exists channel text not null default 'global';

-- les anciens index (un NULL = le fil global) gêneraient la conversion
drop index if exists public.conversation_reads_staff_uk;
drop index if exists public.conversation_reads_admin_uk;

update public.conversation_reads r
set channel = case when r.channel_admin_id = p.coach_id then 'referent' else 'legacy' end
from public.players p
where p.id = r.player_id
  and r.channel_admin_id is not null
  and r.channel = 'global';

update public.conversation_reads set channel_admin_id = null
where channel <> 'legacy' and channel_admin_id is not null;

create unique index if not exists conversation_reads_channel_uk
  on public.conversation_reads (
    player_id, user_id, channel,
    coalesce(channel_admin_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- Qui lit / écrit un canal
-- ---------------------------------------------------------------------------

-- Le titulaire d'un rôle (technique / physique) dans le groupe du joueur.
create or replace function public.is_channel_role_holder(p_player uuid, p_role text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    join public.group_staff gs on gs.group_id = p.group_id
    where p.id = p_player and gs.role = p_role and gs.profile_id = (select auth.uid())
  );
$$;

create or replace function public.can_read_channel(p_player uuid, p_channel text, p_owner uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case p_channel
    when 'global' then
      p_player = (select auth.uid())
      or (select public.is_admin())
      or (select public.is_coach_of(p_player))
      or (select public.is_parent_of(p_player))
    when 'technique' then
      p_player = (select auth.uid())
      or (select public.is_admin())
      or (select public.is_channel_role_holder(p_player, 'technique'))
    when 'physique' then
      p_player = (select auth.uid())
      or (select public.is_admin())
      or (select public.is_channel_role_holder(p_player, 'physique'))
    when 'referent' then
      p_player = (select auth.uid())
      or (select public.is_admin())
      or exists (select 1 from public.players where id = p_player and coach_id = (select auth.uid()))
    when 'parents' then
      (select public.is_admin())
      or (select public.is_coach_of(p_player))
      or (select public.is_parent_of(p_player))
    when 'legacy' then
      p_player = (select auth.uid())
      or (select public.is_admin())
      or p_owner = (select auth.uid())
    else false
  end;
$$;

-- Écrire : lire le canal, sauf l'archive ; et un fil technique / physique
-- n'existe que si le groupe a ce coach (sinon personne pour répondre).
create or replace function public.can_write_channel(p_player uuid, p_channel text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_channel <> 'legacy'
    and (select public.can_read_channel(p_player, p_channel, null))
    and (
      p_channel not in ('technique', 'physique')
      or exists (
        select 1 from public.players p
        join public.group_staff gs on gs.group_id = p.group_id
        where p.id = p_player and gs.role = p_channel
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated
  using ((select public.can_read_channel(player_id, channel, channel_admin_id)));

drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_insert on public.conversation_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.can_write_channel(player_id, channel))
  );

drop policy if exists conversation_messages_update on public.conversation_messages;
create policy conversation_messages_update on public.conversation_messages
  for update to authenticated
  using (
    sender_id = (select auth.uid())
    and (select public.can_read_channel(player_id, channel, channel_admin_id))
  )
  with check (sender_id = (select auth.uid()));

drop policy if exists conversation_messages_delete on public.conversation_messages;
create policy conversation_messages_delete on public.conversation_messages
  for delete to authenticated
  using (
    (select public.is_admin())
    or (
      sender_id = (select auth.uid())
      and (select public.can_read_channel(player_id, channel, channel_admin_id))
    )
  );

drop policy if exists conversation_reads_own on public.conversation_reads;
create policy conversation_reads_own on public.conversation_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select public.can_read_channel(player_id, channel, channel_admin_id))
  );

-- Une pièce jointe se lit si son message se lit (même audience que 0039).
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
        and (select public.can_read_channel(m.player_id, m.channel, m.channel_admin_id))
    )
    or exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'messages'
        and o.name = p_name
        and o.owner_id = (select auth.uid())::text
    );
$fn$;

-- Le rôle du staff ne s'écrit pas depuis un client : l'affectation passe par
-- une action admin (service_role), comme `group_id`.
revoke update (role) on public.group_staff from authenticated;
