import { cookies } from "next/headers";
import { createClient, getCachedUser } from "./supabase/server";
import type { Profile } from "./types";

/** Utilisateur courant + profil (ou null si non connecté). */
export async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: (profile as Profile) ?? null };
}

/**
 * Rôle de l'utilisateur courant sans requête `profiles` dans le cas courant :
 * lit le cookie `vpf-nav` posé par le middleware (uid|role, TTL 15 min) et ne
 * retombe sur la base que s'il est absent ou périmé. Pour les layouts/pages
 * qui adaptent l'UI au rôle — PAS une preuve d'autorisation (les actions
 * sensibles gardent leur vérification serveur).
 */
export async function getNavRole(): Promise<"admin" | "coach" | "player" | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const raw = cookieStore.get("vpf-nav")?.value;
  if (raw) {
    const [uid, role] = raw.split("|");
    if (uid === user.id && (role === "admin" || role === "coach" || role === "player")) {
      return role;
    }
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data?.role as "admin" | "coach" | "player") ?? null;
}
