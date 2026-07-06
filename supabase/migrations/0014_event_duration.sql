-- Durée des événements de la semaine type, pour mesurer le temps de travail
-- hebdomadaire réel. La durée est configurable par le joueur (défaut par type),
-- et figée en snapshot sur la réalisation pour que l'historique survive aux
-- modifications de la semaine type.

alter table public.planned_events
  add column duration_minutes smallint not null default 60
    check (duration_minutes between 5 and 600);

-- snapshot au pointage ; null pour les réalisations antérieures à cette
-- migration → l'app retombe sur la durée par défaut du type
alter table public.event_completions
  add column duration_minutes smallint
    check (duration_minutes is null or duration_minutes between 5 and 600);

-- défauts par type pour les événements déjà planifiés
update public.planned_events set duration_minutes = case event_type
  when 'entrainement_club' then 90
  when 'training_basket'   then 60
  when 'prep_physique'     then 60
  when 'mobilite'          then 10
  when 'revision_scolaire' then 60
  when 'dormir'            then 480
  when 'collation'         then 5
  else 60
end;
