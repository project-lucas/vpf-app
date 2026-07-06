-- Bibliothèque de séances v2 :
--  1. catégories du pôle routine (avant-match, étirements)
--  2. séances taguées par poste (vide = tous les postes)
--  3. bibliothèque visible par tous les joueurs (lecture seule)
--  4. auto-sélection : le joueur peut s'affecter lui-même une séance
--     (assigned_by = lui) et la retirer — le circuit complétions/XP existant
--     fonctionne tel quel.

-- 1. Contrainte pôle ↔ catégorie, étendue au pôle routine ------------------
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
    ('Tir', 'Dribble', 'Passes', 'Finition', 'Footwork', 'Drive', 'Jeu au poste', 'Prise d''écran'))
  or
  (pole = 'physique' and category in
    ('Mobilité', 'Explosivité', 'Endurance', 'Proprioception', 'Kit anti-blessure'))
  or
  (pole = 'routine' and category in
    ('Avant-match', 'Étirements & récupération'))
);

-- 2. Postes concernés par la séance (tableau vide = tous les postes) --------
alter table public.library_sessions
  add column if not exists positions text[] not null default '{}';

-- 3. Bibliothèque en lecture pour tout utilisateur connecté -----------------
-- (le joueur explore tout et choisit ; l'écriture reste admin-only)
drop policy if exists library_sessions_select on public.library_sessions;
create policy library_sessions_select on public.library_sessions for select to authenticated
  using (true);

-- 4. Auto-affectation joueur -------------------------------------------------
-- INSERT : le joueur peut s'affecter une séance à lui-même (assigned_by = lui)
drop policy if exists session_assignments_insert on public.session_assignments;
create policy session_assignments_insert on public.session_assignments for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_coach_of(player_id)) and assigned_by = (select auth.uid()))
    or (player_id = (select auth.uid()) and assigned_by = (select auth.uid()))
  );

-- UPDATE : le joueur ne peut retirer (soft-delete) que ses affectations
-- perso ; celles du coach restent gérées par le coach/admin
drop policy if exists session_assignments_update on public.session_assignments;
create policy session_assignments_update on public.session_assignments for update to authenticated
  using (
    (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (player_id = (select auth.uid()) and assigned_by = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or (select public.is_coach_of(player_id))
    or (player_id = (select auth.uid()) and assigned_by = (select auth.uid()))
  );
