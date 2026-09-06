-- Durées courtes dans la semaine type : une routine de 2 minutes (respiration,
-- étirement ciblé) ou une collation de 5 minutes sont des événements légitimes.
-- La borne basse de 0014 (5 min) passe à 1 min ; le plafond de 10 h ne bouge pas.
-- Idempotent : les contraintes sont recréées sous le même nom.

alter table public.planned_events
  drop constraint if exists planned_events_duration_minutes_check;
alter table public.planned_events
  add constraint planned_events_duration_minutes_check
    check (duration_minutes between 1 and 600);

alter table public.event_completions
  drop constraint if exists event_completions_duration_minutes_check;
alter table public.event_completions
  add constraint event_completions_duration_minutes_check
    check (duration_minutes is null or duration_minutes between 1 and 600);
