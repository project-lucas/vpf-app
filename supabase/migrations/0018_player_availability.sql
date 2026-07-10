-- VPF — Statut de disponibilité du joueur : blessé / vacances
-- Géré par le coach uniquement, écrit via service_role : aucun grant client,
-- un joueur ne peut donc pas geler lui-même sa série ou sortir des moyennes.
--
-- Effets applicatifs (pas de logique DB) :
--  * le cron n'envoie plus de rappels et ne matérialise plus les "not_done"
--    pendant l'indisponibilité → la série (jours sans pointage = neutres) et
--    la discipline sont gelées, pas cassées ;
--  * le joueur indisponible sort des moyennes et alertes du dashboard coach.

create type public.player_availability as enum ('available', 'injured', 'vacation');

alter table public.players
  add column availability public.player_availability not null default 'available',
  add column availability_since date;
