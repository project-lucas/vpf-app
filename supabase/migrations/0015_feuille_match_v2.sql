-- Feuille de match V2 : titulaire (oui/non), détail des tirs (2 pts intérieur /
-- 2 pts extérieur), lancers francs, fautes. Les points et le total de tirs
-- réussis (hors lancer franc) sont désormais CALCULÉS à la saisie et stockés.
-- On retire rebonds, interceptions et les « tirs tentés » (plus de % d'adresse).

-- ---------------------------------------------------------------------------
-- Nouvelles colonnes
-- ---------------------------------------------------------------------------
alter table public.match_stats
  add column is_starter boolean not null default true,
  add column twos_inside_made smallint not null default 0 check (twos_inside_made >= 0),
  add column twos_outside_made smallint not null default 0 check (twos_outside_made >= 0),
  add column free_throws_made smallint not null default 0 check (free_throws_made >= 0),
  add column fouls smallint not null default 0 check (fouls >= 0);

-- ---------------------------------------------------------------------------
-- threes_made et shots_made deviennent obligatoires (remplis à chaque saisie).
-- On backfill les anciens matchs (valeurs nulles) avant de poser NOT NULL.
-- ---------------------------------------------------------------------------
update public.match_stats set threes_made = 0 where threes_made is null;
update public.match_stats set shots_made = 0 where shots_made is null;

alter table public.match_stats
  alter column threes_made set default 0,
  alter column threes_made set not null,
  alter column shots_made set default 0,
  alter column shots_made set not null;

-- ---------------------------------------------------------------------------
-- Colonnes désormais inutiles (les contraintes de cohérence qui les référencent
-- sont supprimées automatiquement avec les colonnes).
-- ---------------------------------------------------------------------------
alter table public.match_stats
  drop column rebounds,
  drop column steals,
  drop column shots_attempted,
  drop column threes_attempted;
