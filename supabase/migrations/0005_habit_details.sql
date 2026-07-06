-- Fiche détaillée d'habitude : description libre + objectif affiché en badge

alter table public.habits
  add column description text not null default '' check (char_length(description) <= 200),
  add column goal text not null default '' check (char_length(goal) <= 80);
