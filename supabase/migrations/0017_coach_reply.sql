-- VPF — Réponse du coach aux bilans hebdomadaires
-- Le coach répond en quelques lignes au bilan du joueur, qui la voit sur son
-- planning et reçoit un push. La réponse est écrite côté serveur
-- (service_role) après contrôle d'autorisation : les clients n'ont jamais le
-- droit d'écrire ces colonnes, un joueur ne peut donc pas se répondre lui-même.

alter table public.weekly_reviews
  add column coach_reply text not null default '',
  add column coach_reply_at timestamptz;

-- Colonnes accessibles en écriture aux clients : tout sauf la réponse du coach.
-- player_id / week_start restent dans le grant UPDATE car l'upsert PostgREST
-- les inclut dans son ON CONFLICT DO UPDATE ; la policy WITH CHECK les verrouille.
revoke insert, update on public.weekly_reviews from anon, authenticated;
grant insert (player_id, week_start, went_well, to_improve)
  on public.weekly_reviews to authenticated;
grant update (player_id, week_start, went_well, to_improve, updated_at)
  on public.weekly_reviews to authenticated;

-- updated_at ne bouge que quand le contenu du bilan JOUEUR change : la réponse
-- du coach ne doit pas faire remonter le bilan comme « envoyé » dans le flux
-- d'activité du dashboard coach.
create or replace function public.weekly_reviews_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.went_well is distinct from old.went_well
     or new.to_improve is distinct from old.to_improve then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger set_updated_at on public.weekly_reviews;
create trigger set_updated_at before update on public.weekly_reviews
  for each row execute function public.weekly_reviews_set_updated_at();
