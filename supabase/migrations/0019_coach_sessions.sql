-- VPF — Création de séances par le coach
-- Les coachs créent et gèrent leurs propres séances dans la bibliothèque ;
-- les séances de l'admin — dont les programmes par poste — restent en lecture
-- seule pour eux. Les écritures passent par le service_role après contrôle
-- applicatif (admin, ou coach propriétaire) : aucune nouvelle policy.

alter table public.library_sessions
  add column created_by uuid references public.profiles (id) on delete set null;
