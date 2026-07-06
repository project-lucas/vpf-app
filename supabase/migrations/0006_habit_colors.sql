-- Palette étendue pour les habitudes (style HabitKit : couleur pleine + déclinaison pâle)

alter table public.habits drop constraint if exists habits_color_check;
alter table public.habits add constraint habits_color_check check (
  color in ('gold', 'orange', 'yellow', 'red', 'pink', 'green', 'blue', 'purple', 'teal')
);
