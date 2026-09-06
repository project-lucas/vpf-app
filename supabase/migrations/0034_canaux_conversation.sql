-- VPF — Plusieurs canaux de discussion par joueur (offre formation)
--
-- Jusqu'ici un joueur = UN fil : joueur + coach référent + parents, avec les
-- admins en supervision. C'est ce que garde l'offre perf.
--
-- L'offre formation ouvre en plus un fil PRIVÉ par admin (Lucas, Maxime) :
-- le joueur leur écrit sans passer devant son coach ni ses parents.
--
--  * channel_admin_id null        → le fil historique (coach & parents).
--    Toutes les lignes existantes y restent, rien à migrer.
--  * channel_admin_id = <admin>   → fil privé joueur ↔ cet admin. Le coach
--    référent et les parents n'y ont AUCUN accès. Les admins, eux, se lisent
--    mutuellement : supervision croisée assumée (deux personnes au club, on
--    veut pouvoir prendre le relais de l'autre).
--
-- Offre perf = un seul fil : la with check refuse la création d'un fil privé
-- sur une fiche perf, en plus de l'interface qui ne l'affiche pas. Comme pour
-- l'hygiène (0026), la LECTURE reste ouverte — un joueur repassé en perf ne
-- perd pas l'historique de ses fils privés, il retrouve tout en formation.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Colonnes de canal
-- ---------------------------------------------------------------------------

alter table public.conversation_messages
  add column if not exists channel_admin_id uuid references public.profiles (id) on delete cascade;

-- le fil d'un canal se lit toujours par (joueur, canal) trié dans le temps
create index if not exists conversation_messages_channel_idx
  on public.conversation_messages (player_id, channel_admin_id, created_at);

-- Le marqueur de lecture devient propre à chaque canal : un joueur peut avoir
-- lu le fil de son coach et pas celui de Maxime.
alter table public.conversation_reads
  add column if not exists channel_admin_id uuid references public.profiles (id) on delete cascade;

-- La clé primaire (player_id, user_id) ne tient plus : elle est remplacée par
-- deux index uniques partiels — une colonne de clé ne pouvant pas être NULL,
-- c'est la seule façon de garder le canal « coach » (NULL) unique lui aussi.
alter table public.conversation_reads drop constraint if exists conversation_reads_pkey;

create unique index if not exists conversation_reads_staff_uk
  on public.conversation_reads (player_id, user_id)
  where channel_admin_id is null;

create unique index if not exists conversation_reads_admin_uk
  on public.conversation_reads (player_id, user_id, channel_admin_id)
  where channel_admin_id is not null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Vrai si ce compte est un admin — sert à refuser un « fil privé » ouvert sur
-- un profil quelconque (un joueur qui appellerait l'API à la main).
create or replace function public.is_admin_profile(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = p_user and role = 'admin'
  );
$$;

-- Vrai si ce joueur a droit aux fils privés : offre formation, fiche active.
create or replace function public.player_has_private_channels(p_player uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where id = p_player
      and offer = 'formation'::public.player_offer
      and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies — le canal décide de l'audience
-- ---------------------------------------------------------------------------

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated
  using (
    -- fil coach & parents : audience de 0031, inchangée
    (
      channel_admin_id is null
      and (
        player_id = (select auth.uid())
        or (select public.is_admin())
        or (select public.is_coach_of(player_id))
        or (select public.is_parent_of(player_id))
      )
    )
    -- fil privé : le joueur concerné et les admins, personne d'autre
    or (
      channel_admin_id is not null
      and (player_id = (select auth.uid()) or (select public.is_admin()))
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
        -- un fil privé n'existe que sur une fiche formation, et seulement
        -- au nom d'un vrai admin
        and (select public.player_has_private_channels(player_id))
        and (select public.is_admin_profile(channel_admin_id))
        and (player_id = (select auth.uid()) or (select public.is_admin()))
      )
    )
  );

-- Suppression : la règle de 0033 (le sien, ou tout pour un admin), étendue au
-- canal — on ne supprime que dans un fil auquel on a toujours accès.
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
        or (channel_admin_id is not null and player_id = (select auth.uid()))
      )
    )
  );

-- Marqueurs de lecture : chacun les siens, sur un canal auquel il a accès.
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
        and (player_id = (select auth.uid()) or (select public.is_admin()))
      )
    )
  );
