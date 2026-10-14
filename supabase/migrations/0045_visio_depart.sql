-- VPF — La visio de départ, validée par un admin
--
-- Tout joueur passe par une visio de closing (avec la famille), puis par une
-- visio de départ faite par un admin. C'est l'admin qui coche « faite » dans
-- le tableau de l'accueil. Écriture en service_role après vérification du
-- rôle (`setKickoffDone`) : les colonnes ne sont pas accordées aux clients.
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists kickoff_done_at timestamptz,
  add column if not exists kickoff_done_by uuid references public.profiles (id) on delete set null;
