-- VPF — Un canal privé par membre du staff, coach référent compris
--
-- Jusqu'ici (0034) un joueur formation avait un fil privé par ADMIN, et
-- personne d'autre. Le club recrute des coachs référents : eux aussi doivent
-- pouvoir parler seul à seul avec leur joueur — et les admins doivent voir ce
-- fil, comme ils se voient entre eux (supervision assumée).
--
-- Le modèle ne change pas : `channel_admin_id` reste « le porteur du fil ».
-- Ce qui change, c'est QUI peut être porteur — un admin, ou le coach référent
-- du joueur — et qui lit un fil privé : le joueur, les admins, et le porteur.
--
-- Le nom de colonne est gardé (le renommer casserait index, policies et code
-- pour rien) ; sa sémantique est désormais « staff porteur ».
-- ---------------------------------------------------------------------------

-- Porteur légitime d'un fil privé : un admin, ou le coach référent du joueur.
create or replace function public.is_private_channel_owner(p_player uuid, p_owner uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_owner and role = 'admin')
      or exists (select 1 from public.players where id = p_player and coach_id = p_owner);
$$;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated
  using (
    -- fil global : audience inchangée
    (
      channel_admin_id is null
      and (
        player_id = (select auth.uid())
        or (select public.is_admin())
        or (select public.is_coach_of(player_id))
        or (select public.is_parent_of(player_id))
      )
    )
    -- fil privé : le joueur, les admins, et le porteur du fil
    or (
      channel_admin_id is not null
      and (
        player_id = (select auth.uid())
        or (select public.is_admin())
        or channel_admin_id = (select auth.uid())
      )
    )
  );

drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_insert on public.conversation_messages
  for insert to authenticated
  with check (
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
        and (select public.player_has_private_channels(player_id))
        and (select public.is_private_channel_owner(player_id, channel_admin_id))
        and (
          player_id = (select auth.uid())
          or (select public.is_admin())
          or channel_admin_id = (select auth.uid())
        )
      )
    )
  );

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
        and (
          player_id = (select auth.uid())
          or (select public.is_admin())
          or channel_admin_id = (select auth.uid())
        )
      )
    )
  )
  with check (sender_id = (select auth.uid()));

drop policy if exists conversation_messages_delete on public.conversation_messages;
create policy conversation_messages_delete on public.conversation_messages
  for delete to authenticated
  using (
    (select public.is_admin())
    or (
      sender_id = (select auth.uid())
      and (
        (
          channel_admin_id is null
          and (
            player_id = (select auth.uid())
            or (select public.is_coach_of(player_id))
            or (select public.is_parent_of(player_id))
          )
        )
        or (
          channel_admin_id is not null
          and (player_id = (select auth.uid()) or channel_admin_id = (select auth.uid()))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Marqueurs de lecture : le porteur du fil a le sien
-- ---------------------------------------------------------------------------

drop policy if exists conversation_reads_own on public.conversation_reads;
create policy conversation_reads_own on public.conversation_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
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
        and (
          player_id = (select auth.uid())
          or (select public.is_admin())
          or channel_admin_id = (select auth.uid())
        )
      )
    )
  );
