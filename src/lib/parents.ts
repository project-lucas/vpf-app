import { createAdminClient } from "./supabase/admin";

export interface PlayerParentInfo {
  id: string;
  name: string;
}

/**
 * Comptes parents liés à un joueur, avec leur nom.
 *
 * Passe par le service_role pour les NOMS : la RLS de profiles ne donne pas au
 * coach l'accès aux profils parents (et n'a pas à le faire globalement).
 * L'appelant DOIT avoir vérifié sous RLS qu'il a le droit de consulter ce
 * joueur avant d'appeler cette fonction (lecture de la fiche).
 */
export async function getPlayerParents(playerId: string): Promise<PlayerParentInfo[]> {
  const admin = createAdminClient();
  const { data: links } = await admin
    .from("parent_links")
    .select("parent_id")
    .eq("player_id", playerId);
  const ids = (links ?? []).map((l) => l.parent_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);

  return (profiles ?? [])
    .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
