-- Stats de tir par match (nullable : les matchs déjà saisis n'en ont pas) et
-- enrichissement du profil joueur (catégorie d'âge, photo d'avatar).

-- ---------------------------------------------------------------------------
-- match_stats : tirs tentés/réussis + 3 points
-- ---------------------------------------------------------------------------

alter table public.match_stats
  add column shots_attempted smallint check (shots_attempted between 0 and 200),
  add column shots_made smallint check (shots_made between 0 and 200),
  add column threes_attempted smallint check (threes_attempted between 0 and 100),
  add column threes_made smallint check (threes_made between 0 and 100);

alter table public.match_stats
  add constraint match_stats_shots_coherent
    check (shots_made is null or shots_attempted is null or shots_made <= shots_attempted),
  add constraint match_stats_threes_coherent
    check (threes_made is null or threes_attempted is null or threes_made <= threes_attempted);

-- ---------------------------------------------------------------------------
-- players : catégorie d'âge, éditable aussi par le joueur (comme ses mensurations)
-- ---------------------------------------------------------------------------

alter table public.players
  add column category text check (category in ('U13', 'U15', 'U17', 'U18', 'Senior'));

grant update (category) on public.players to authenticated;

-- le joueur peut maintenant éditer son propre profil (les colonnes sensibles
-- coach_id / status / onboarding_completed restent protégées par les grants)
create policy players_update_self on public.players for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles : avatar photo (URL publique du bucket "avatars")
-- ---------------------------------------------------------------------------

alter table public.profiles add column avatar_url text;

grant update (avatar_url) on public.profiles to authenticated;

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- stockage des avatars : lecture publique, écriture dans son propre dossier
-- (chemin imposé : <user_id>/avatar.<ext>)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
