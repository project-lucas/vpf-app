import { createClient, getCachedUser } from "./supabase/server";
import { toOffer } from "./offers";
import type { PlayerOffer } from "./types";

export interface ParentChild {
  /** id du compte parent connecté */
  parentId: string;
  /** id du joueur suivi (l'enfant) */
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  club: string;
  offer: PlayerOffer;
  availability: string;
}

/**
 * L'enfant suivi par le parent connecté, ou null si le compte n'est lié à
 * aucun joueur actif (lien retiré, joueur archivé…). Tout se lit sous RLS :
 * parent_links ne renvoie que le lien du parent, players/profiles sont ouverts
 * au parent par la migration 0031.
 */
export async function getParentChild(): Promise<ParentChild | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: link } = await supabase
    .from("parent_links")
    .select("player_id")
    .eq("parent_id", user.id)
    .maybeSingle();
  if (!link) return null;

  const { data: player } = await supabase
    .from("players")
    .select(
      "id, position, club, offer, availability, status, profile:profiles!players_id_fkey(first_name, last_name)"
    )
    .eq("id", link.player_id)
    .maybeSingle();
  // la RLS (is_parent_of) ne renvoie déjà que les joueurs actifs — la
  // vérification du statut est une ceinture de sécurité
  if (!player || player.status !== "active") return null;

  const profile = Array.isArray(player.profile) ? player.profile[0] : player.profile;
  return {
    parentId: user.id,
    playerId: player.id,
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    position: player.position ?? "",
    club: player.club ?? "",
    offer: toOffer(player.offer),
    availability: player.availability ?? "available",
  };
}
