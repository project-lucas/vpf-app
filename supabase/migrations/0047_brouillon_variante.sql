-- VPF — Une seconde version pour les brouillons de décrochage
--
-- Face à un joueur qui décroche, le staff choisit entre proposer une visio
-- (`body`) et simplement prendre des nouvelles (« qu'est-ce qui se passe ? »,
-- `alt_body`). Jarvis rédige les deux ; vide = message type côté interface.
-- ---------------------------------------------------------------------------

alter table public.jarvis_drafts
  add column if not exists alt_body text not null default '';
