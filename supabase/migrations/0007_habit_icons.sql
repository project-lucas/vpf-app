-- Icônes vectorielles (lucide-react) : la colonne stocke le nom de l'icône
-- (ex. 'dumbbell', 'droplets') au lieu d'un emoji.

alter table public.habits rename column emoji to icon;
alter table public.habits alter column icon set default 'flame';

-- conversion des emojis existants vers leur équivalent lucide
update public.habits set icon = case icon
  when '🔥' then 'flame'
  when '💧' then 'droplets'
  when '🏀' then 'target'
  when '😴' then 'moon'
  when '📚' then 'book-open'
  when '🧘' then 'person-standing'
  when '💪' then 'dumbbell'
  when '🍎' then 'apple'
  when '⏰' then 'alarm-clock'
  when '🎯' then 'target'
  else icon
end;

-- tout reliquat non reconnu retombe sur la flamme
update public.habits set icon = 'flame' where icon !~ '^[a-z][a-z-]*$';
