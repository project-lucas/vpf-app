-- VPF — Nouveaux types de tâches « hygiène de vie » dans la semaine type :
-- petit déjeuner et hydratation (la collation existe déjà). Libellés, icônes,
-- couleurs et durées par défaut vivent côté app (constants.ts / EventIcon).

alter type public.event_type add value if not exists 'petit_dejeuner';
alter type public.event_type add value if not exists 'hydratation';
