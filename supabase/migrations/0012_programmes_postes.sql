-- Programmes techniques par poste (5 postes × 4 séances) :
--  1. contenu riche sur library_sessions : sous-titre, intro, exercices,
--     challenge noté (contenu seedé par scripts/seed-programmes.ts)
--  2. catégorie basket « Programme »
--  3. score du challenge (ex. 8/10) sur la réalisation

-- 1. Contenu riche -----------------------------------------------------------
-- exercises : [{ order, title, durationMinutes, tag, description }]
-- challenge : { durationMinutes, title, description, maxScore, scoreUnit, objective }
alter table public.library_sessions
  add column if not exists subtitle text not null default '',
  add column if not exists intro text not null default '',
  add column if not exists exercises jsonb not null default '[]'::jsonb,
  add column if not exists challenge jsonb;

-- 2. Contrainte pôle ↔ catégorie, étendue à « Programme » (basket) -----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.library_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%pole%'
  loop
    execute format('alter table public.library_sessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.library_sessions add constraint library_sessions_pole_category_check check (
  (pole = 'basket' and category in
    ('Programme', 'Tir', 'Dribble', 'Passes', 'Finition', 'Footwork', 'Drive', 'Jeu au poste', 'Prise d''écran'))
  or
  (pole = 'physique' and category in
    ('Mobilité', 'Explosivité', 'Endurance', 'Proprioception', 'Kit anti-blessure'))
  or
  (pole = 'routine' and category in
    ('Avant-match', 'Étirements & récupération'))
);

-- 3. Score du challenge noté --------------------------------------------------
alter table public.session_completions
  add column if not exists challenge_score integer
    check (challenge_score is null or challenge_score >= 0);
