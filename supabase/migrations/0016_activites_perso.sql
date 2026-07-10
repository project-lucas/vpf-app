-- Activités personnalisées du joueur : un événement peut être de type « autre »
-- avec un nom, une icône (nom lucide, même registre que les habitudes) et une
-- couleur (clé HABIT_COLORS) choisis par le joueur. Les complétions gardent un
-- snapshot de ces champs pour que l'historique (et le suivi cumulatif du
-- dashboard) survive aux modifications de la semaine type.

alter type public.event_type add value if not exists 'autre';

alter table public.planned_events
  add column if not exists custom_name text not null default '',
  add column if not exists custom_icon text not null default '',
  add column if not exists custom_color text not null default '';

alter table public.event_completions
  add column if not exists custom_name text not null default '',
  add column if not exists custom_icon text not null default '',
  add column if not exists custom_color text not null default '';
