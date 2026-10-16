-- VPF — Réparation : écrire dans un fil par rôle
--
-- 0048 a ajouté `conversation_messages.channel` sans l'ajouter au grant
-- d'insertion par colonnes de 0043. Or l'envoi nomme toujours son fil
-- (`channel: "global" | "parents" | …`) : depuis 0048, tout insert client
-- était refusé (42501) — messages du joueur, des parents, du staff, rapports
-- de Jarvis aux parents. La RLS (`can_write_channel`) reste seule juge du fil.
-- ---------------------------------------------------------------------------

grant insert (channel) on public.conversation_messages to authenticated;
