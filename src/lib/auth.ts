import { cookies } from "next/headers";
import { createClient, getCachedUser } from "./supabase/server";
import type { Profile } from "./types";

/** Utilisateur courant + profil (ou null si non connecté). */
export async function getAuthProfile() {
  const supabase = await createClient();
  // getCachedUser : jeton vérifié localement et dédupliqué par requête
  const user = await getCachedUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: (profile as Profile) ?? null };
}

/**
 * Garde « l'appelant est bien du staff », à poser en tête de toute action qui
 * écrira ensuite en service_role sur la fiche d'un joueur.
 *
 * Le motif historique « une lecture RLS de `players` prouve l'autorisation » ne
 * vaut plus depuis la migration 0031 : `players_select` accorde aussi la
 * lecture aux PARENTS du joueur (`is_parent_of`). Une action qui se contentait
 * de cette lecture était donc ouverte aux parents — et, sans le garde
 * `user.id === playerId`, au joueur lui-même.
 *
 * La lecture RLS reste nécessaire APRÈS ce garde : elle prouve le lien avec CE
 * joueur-là (coach référent, ou admin). Les deux vont ensemble.
 */
export async function requireStaffProfile(): Promise<
  { ok: true; userId: string; role: "coach" | "admin" } | { ok: false; error: string }
> {
  const { profile } = await getAuthProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "coach")) {
    return { ok: false, error: "Réservé au coach." };
  }
  return { ok: true, userId: profile.id, role: profile.role };
}

/**
 * Rôle de l'utilisateur courant sans requête `profiles` dans le cas courant :
 * lit le cookie `vpf-nav` posé par le middleware (uid|role, TTL 15 min) et ne
 * retombe sur la base que s'il est absent ou périmé. Pour les layouts/pages
 * qui adaptent l'UI au rôle — PAS une preuve d'autorisation (les actions
 * sensibles gardent leur vérification serveur).
 */
export async function getNavRole(): Promise<"admin" | "coach" | "player" | "parent" | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const raw = cookieStore.get("vpf-nav")?.value;
  if (raw) {
    const [uid, role] = raw.split("|");
    if (
      uid === user.id &&
      (role === "admin" || role === "coach" || role === "player" || role === "parent")
    ) {
      return role;
    }
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data?.role as "admin" | "coach" | "player" | "parent") ?? null;
}
