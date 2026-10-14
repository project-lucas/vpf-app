-- VPF — Durcissement du modèle groupes / prises en charge / journal (0040)
--
-- Suite de la revue sécurité du lot 0040. Rien ne change pour les deux admins ;
-- tout vise le jour où un coach entre dans le staff d'un groupe.
--
--  1. `is_coach_of` exige que le membre du staff ait encore un rôle staff.
--  2. Les jetons d'invitation parent restent au coach RÉFÉRENT et aux admins :
--     un coach du groupe suit le joueur, il n'invite pas ses parents.
--  3. `task_claims` : une mise à jour ne peut plus déplacer une prise en charge
--     vers un autre joueur / une autre nature (grant de colonnes + WITH CHECK).
--  4. `staff_journal` : un envoi dans un fil privé n'est lisible que par les
--     admins et son auteur (l'audience d'un fil privé, 0034/0037).
--  5. Grants explicites : rien pour `anon`, pas d'écriture client sur le journal.
--  6. Un groupe qui porte encore des joueurs ne se supprime pas (FK restrict).
-- ---------------------------------------------------------------------------

-- 1. staff encore staff
create or replace function public.is_coach_of(p_player uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.id = p_player
      and p.status = 'active'
      and (
        p.coach_id = auth.uid()
        or exists (
          select 1
          from public.group_staff gs
          join public.profiles pr on pr.id = gs.profile_id and pr.role in ('coach', 'admin')
          where gs.group_id = p.group_id and gs.profile_id = auth.uid()
        )
      )
  );
$$;

-- Le coach référent d'un joueur actif — sans le staff du groupe.
create or replace function public.is_referent_of(p_player uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where id = p_player and coach_id = auth.uid() and status = 'active'
  );
$$;

-- 2. invitations parent : référent + admins
drop policy if exists parent_invitations_select on public.parent_invitations;
create policy parent_invitations_select on public.parent_invitations
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_referent_of(player_id)));

-- 3. prises en charge : on ne réécrit que « qui » et « quand »
revoke update on public.task_claims from anon, authenticated;
grant update (claimed_by, claimed_at) on public.task_claims to authenticated;

drop policy if exists task_claims_update on public.task_claims;
create policy task_claims_update on public.task_claims for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check (
    claimed_by = (select auth.uid())
    and ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  );

-- 4. journal : l'audience d'un fil privé ne s'élargit pas par le journal
drop policy if exists staff_journal_select on public.staff_journal;
create policy staff_journal_select on public.staff_journal for select to authenticated
  using (
    (select public.is_admin())
    or (
      action <> 'message_private'
      and (
        actor_id = (select auth.uid())
        or (player_id is not null and (select public.is_coach_of(player_id)))
      )
    )
    or (action = 'message_private' and actor_id = (select auth.uid()))
  );

-- 5. grants explicites
revoke all on public.groups, public.group_staff, public.task_claims, public.staff_journal from anon;
revoke insert, update, delete on public.staff_journal from authenticated;

-- 6. un groupe habité ne se supprime pas
alter table public.players
  drop constraint if exists players_group_id_fkey,
  add constraint players_group_id_fkey
    foreign key (group_id) references public.groups (id) on delete restrict;
