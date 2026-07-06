-- Visibilité pilotée par le coach :
--  Le coach coche pour chaque joueur les séances qu'il peut voir
--  (session_assignments actives). Le joueur ne choisit plus rien lui-même :
--  on retire l'auto-affectation introduite en 0011 et on referme la lecture
--  de la bibliothèque (un joueur ne lit que les séances qui lui sont visibles).

-- 1. Bibliothèque : lecture réservée à l'admin, aux coachs, et au joueur
--    uniquement pour les séances cochées pour lui -----------------------------
drop policy if exists library_sessions_select on public.library_sessions;
create policy library_sessions_select on public.library_sessions for select to authenticated
  using (
    (select public.is_admin())
    or (select public.get_role()) = 'coach'
    or (select public.has_active_assignment(id))
  );

-- 2. Affectations : seuls l'admin et le coach référent décident -------------
drop policy if exists session_assignments_insert on public.session_assignments;
create policy session_assignments_insert on public.session_assignments for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_coach_of(player_id)) and assigned_by = (select auth.uid()))
  );

drop policy if exists session_assignments_update on public.session_assignments;
create policy session_assignments_update on public.session_assignments for update to authenticated
  using ((select public.is_admin()) or (select public.is_coach_of(player_id)))
  with check ((select public.is_admin()) or (select public.is_coach_of(player_id)));
