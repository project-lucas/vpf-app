"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Inscription joueur via lien d'invitation à usage unique.
 * Consommation atomique du token (aucune course possible), puis création du
 * compte auth + profil + fiche joueur rattachée au coach de l'invitation.
 */
export async function signupWithInvitation(
  token: string,
  email: string,
  password: string
): Promise<ActionResult> {
  email = email.trim().toLowerCase();
  if (!UUID_RE.test(token)) return { ok: false, error: "Invitation invalide." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Adresse email invalide." };
  if (password.length < 8) {
    return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const admin = createAdminClient();

  // Consommation atomique : seul le premier appel gagne la ligne
  const { data: consumed, error: consumeError } = await admin
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", token)
    .is("used_at", null)
    .select("coach_id")
    .maybeSingle();

  if (consumeError || !consumed) {
    return { ok: false, error: "Invitation invalide ou déjà utilisée." };
  }

  const rollback = () =>
    admin.from("invitations").update({ used_at: null }).eq("id", token);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    await rollback();
    const msg = createError?.message ?? "";
    return {
      ok: false,
      error: msg.includes("already") || msg.includes("registered")
        ? "Un compte existe déjà avec cet email."
        : "Impossible de créer le compte. Réessaie.",
    };
  }

  const userId = created.user.id;

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: userId, role: "player" });
  const { error: playerError } = profileError
    ? { error: profileError }
    : await admin.from("players").insert({ id: userId, coach_id: consumed.coach_id });

  if (profileError || playerError) {
    await admin.auth.admin.deleteUser(userId);
    await rollback();
    return { ok: false, error: "Impossible de créer le compte. Réessaie." };
  }

  await admin.from("invitations").update({ used_by: userId }).eq("id", token);
  return { ok: true };
}

export interface OnboardingData {
  first_name: string;
  last_name: string;
  position: string;
  club: string;
  birthdate: string;
  height_cm: number;
  weight_kg: number;
  season_goal: string;
}

/**
 * Questionnaire initial obligatoire. Passe par le service_role car le joueur
 * n'a aucun droit d'écriture sur son profil (verrouillé après création).
 * Utilisable une seule fois : refusé si l'onboarding est déjà terminé.
 */
export async function completeOnboarding(data: OnboardingData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };

  const first_name = data.first_name.trim();
  const last_name = data.last_name.trim();
  if (!first_name || !last_name) return { ok: false, error: "Prénom et nom sont obligatoires." };
  if (!data.position || !data.club.trim() || !data.birthdate || !data.season_goal.trim()) {
    return { ok: false, error: "Tous les champs sont obligatoires." };
  }
  if (!(data.height_cm >= 100 && data.height_cm <= 260)) {
    return { ok: false, error: "Taille invalide (en cm)." };
  }
  if (!(data.weight_kg >= 20 && data.weight_kg <= 250)) {
    return { ok: false, error: "Poids invalide (en kg)." };
  }

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("onboarding_completed, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!player || player.status !== "active") {
    return { ok: false, error: "Compte joueur introuvable." };
  }
  if (player.onboarding_completed) {
    return { ok: false, error: "Ton profil a déjà été créé. Contacte ton coach pour le modifier." };
  }

  const { error: e1 } = await admin
    .from("profiles")
    .update({ first_name, last_name })
    .eq("id", user.id);
  const { error: e2 } = await admin
    .from("players")
    .update({
      position: data.position,
      club: data.club.trim(),
      birthdate: data.birthdate,
      height_cm: Math.round(data.height_cm),
      weight_kg: data.weight_kg,
      season_goal: data.season_goal.trim(),
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (e1 || e2) return { ok: false, error: "Enregistrement impossible. Réessaie." };
  return { ok: true };
}
