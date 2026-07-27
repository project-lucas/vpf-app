-- Nouvelles catégories de séance, et multi-catégories en préparation physique.
--
--   Technique : Début de séance · Cœur de séance · Challenge      (1 seule)
--   Physique  : Explosivité · Endurance · Renforcement musculaire
--               · Proprioception                                   (1 ou plusieurs)
--   Routine   : Avant-match · Santé / Prévention des blessures     (1 seule)
--
-- La colonne `category` (une valeur) est remplacée par `categories` (tableau) :
-- un même stockage pour les trois pôles, seul le pôle physique autorise
-- plusieurs valeurs (contrainte ci-dessous, miroir de src/lib/constants.ts).
--
-- Report des anciennes valeurs :
--   basket   « Programme »                → Cœur de séance
--   basket   Tir/Dribble/Passes/Finition… → Début de séance
--   physique Explosivité/Endurance/Proprioception → inchangées
--   routine  « Avant-match »              → inchangée
--   routine  « Étirements & récupération »→ Santé / Prévention des blessures
--   « Mobilité » et « Kit anti-blessure » : catégories abandonnées sans
--   équivalent, les séances concernées sont supprimées (aucune au moment de
--   l'écriture — la seule séance « Kit anti-blessure » a été repassée en
--   Proprioception depuis l'interface coach).

alter table public.library_sessions
  add column if not exists categories text[] not null default '{}';

-- Reprise des données : seulement si l'ancienne colonne est encore là
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_sessions'
      and column_name = 'category'
  ) then
    delete from public.library_sessions
      where pole = 'physique' and category in ('Mobilité', 'Kit anti-blessure');

    update public.library_sessions set categories = case
        when pole = 'basket' and category = 'Programme' then array['Cœur de séance']
        when pole = 'basket' then array['Début de séance']
        when pole = 'routine' and category = 'Avant-match' then array['Avant-match']
        when pole = 'routine' then array['Santé / Prévention des blessures']
        else array[category]
      end
      where cardinality(categories) = 0;
  end if;
end $$;

-- Anciennes contraintes pôle ↔ catégorie (nom variable selon la migration
-- qui les a posées : contrainte anonyme en 0001, nommée en 0011/0012)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.library_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%category%'
  loop
    execute format('alter table public.library_sessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.library_sessions drop column if exists category;

alter table public.library_sessions
  add constraint library_sessions_categories_check check (
    cardinality(categories) > 0
    and (
      (pole = 'basket'
        and cardinality(categories) = 1
        and categories <@ array['Début de séance', 'Cœur de séance', 'Challenge'])
      or
      -- seul pôle multi-catégories
      (pole = 'physique'
        and categories <@ array['Explosivité', 'Endurance', 'Renforcement musculaire', 'Proprioception'])
      or
      (pole = 'routine'
        and cardinality(categories) = 1
        and categories <@ array['Avant-match', 'Santé / Prévention des blessures'])
    )
  );
