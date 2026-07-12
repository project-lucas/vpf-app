-- VPF — Les coachs peuvent inviter leurs propres joueurs
--
-- Jusqu'ici seul l'admin pouvait créer des invitations. On ouvre le flux aux
-- coachs : ils invitent leurs joueurs depuis /coach/joueurs.
--
-- Les écritures réelles (création / suppression d'invitation) restent portées
-- par le service_role dans les server actions, avec vérification applicative
-- (un coach ne peut agir que sur ses propres invitations). Cette policy sert
-- uniquement à laisser la page lire la liste via le client soumis à la RLS.

create policy invitations_coach_select on public.invitations for select to authenticated
  using (coach_id = (select auth.uid()));
