-- VPF — Chacun peut supprimer SES propres messages
--
-- Jusqu'ici seul un admin pouvait supprimer un message du fil ou une annonce.
-- On ouvre la suppression à l'auteur : joueur, coach, admin et parent effacent
-- ce qu'ils ont écrit (erreur de fil, message envoyé trop vite…). Les messages
-- des autres restent intouchables — sauf pour un admin, qui garde la main sur
-- l'ensemble (modération).
--
-- Toujours pas d'édition après envoi (le revoke update de 0028 tient) : un
-- message se supprime, il ne se réécrit pas.
-- ---------------------------------------------------------------------------

drop policy if exists conversation_messages_delete on public.conversation_messages;
create policy conversation_messages_delete on public.conversation_messages
  for delete to authenticated
  using (
    (select public.is_admin())
    -- son propre message, dans un fil auquel on a toujours accès
    or (
      sender_id = (select auth.uid())
      and (
        player_id = (select auth.uid())
        or (select public.is_coach_of(player_id))
        or (select public.is_parent_of(player_id))
      )
    )
  );

-- Annonces : l'auteur supprime les siennes, l'admin supprime tout. (À ce jour
-- seuls les admins publient — la clause author_id prépare l'ouverture aux
-- coachs sans repasser par une migration.)
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete to authenticated
  using (
    (select public.is_admin())
    or author_id = (select auth.uid())
  );
