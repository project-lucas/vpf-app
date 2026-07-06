import { createClient } from "./supabase/server";
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
