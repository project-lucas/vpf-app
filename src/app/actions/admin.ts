"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth";
import { allowsMultipleCategories, CATEGORIES, POSITIONS, sortCategories } from "@/lib/constants";
import { DEFAULT_OFFER, toOffer } from "@/lib/offers";
import type { ActionResult, PlayerOffer, SessionPole } from "@/lib/types";

/** Vérifie que l'appelant est admin avant toute opération service_role. */
async function requireAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Accès réservé à l'admin." };
  }
  return { ok: true, adminId: profile.id };
}

/** Vérifie que l'appelant est coach ou admin (staff) avant une opération service_role. */
async function requireStaff(): Promise<
  { ok: true; userId: string; role: "coach" | "admin" } | { ok: false; error: string }
> {
  const { profile } = await getAuthProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "coach")) {
    return { ok: false, error: "Accès réservé au staff." };
  }
  return { ok: true, userId: profile.id, role: profile.role };
}

// ---------------------------------------------------------------------------
// Coachs
// ---------------------------------------------------------------------------

export async function createCoach(data: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  whatsapp_number: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const email = data.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Email invalide." };
  if (data.password.length < 8) {
    return { ok: false, error: "Mot de passe : 8 caractères minimum." };
  }
  if (!data.first_name.trim() || !data.last_name.trim()) {
    return { ok: false, error: "Prénom et nom obligatoires." };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return {
      ok: false,
      error: createError?.message.includes("already")
        ? "Un compte existe déjà avec cet email."
        : "Création impossible.",
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    role: "coach",
    first_name: data.first_name.trim(),
    last_name: data.last_name.trim(),
    whatsapp_number: data.whatsapp_number.trim(),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Création impossible." };
  }

  revalidatePath("/coach/club", "layout");
  return { ok: true };
}

export async function updateCoach(
  coachId: string,
  data: { first_name: string; last_name: string; whatsapp_number: string; password?: string }
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  // les deux admins apparaissent aussi dans le Club (ils coachent leurs joueurs)
  const { error } = await admin
    .from("profiles")
    .update({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      whatsapp_number: data.whatsapp_number.trim(),
    })
    .eq("id", coachId)
    .in("role", ["coach", "admin"]);
  if (error) return { ok: false, error: "Modification impossible." };

  if (data.password) {
    if (data.password.length < 8) return { ok: false, error: "Mot de passe : 8 caractères minimum." };
    const { error: pwError } = await admin.auth.admin.updateUserById(coachId, {
      password: data.password,
    });
    if (pwError) return { ok: false, error: "Mot de passe non modifié." };
  }

  revalidatePath("/coach/club", "layout");
  return { ok: true };
}

/**
 * Supprime définitivement un coach. Ses joueurs (actifs et archivés) sont
 * d'abord réassignés à l'admin qui exécute l'action — sinon la contrainte
 * `players.coach_id` (on delete restrict) bloquerait la suppression. La
 * suppression du compte auth cascade ensuite sur le profil, ses invitations et
 * ses subscriptions push. Un admin ne peut pas être supprimé par cette voie.
 */
export async function deleteCoach(coachId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (coachId === guard.adminId) return { ok: false, error: "Tu ne peux pas te supprimer toi-même." };

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", coachId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Coach introuvable." };
  if (target.role !== "coach") {
    return { ok: false, error: "Seuls les coachs peuvent être supprimés." };
  }

  // Réassigne tous ses joueurs (actifs + archivés) à l'admin avant suppression.
  const { error: reassignError } = await admin
    .from("players")
    .update({ coach_id: guard.adminId })
    .eq("coach_id", coachId);
  if (reassignError) return { ok: false, error: "Réassignation des joueurs impossible." };

  const { error: deleteError } = await admin.auth.admin.deleteUser(coachId);
  if (deleteError) return { ok: false, error: "Suppression du compte impossible." };

  revalidatePath("/coach/club", "layout");
  revalidatePath("/coach");
  return { ok: true };
}

/**
 * Change le coach référent d'un joueur : vers un autre coach, vers un autre
 * admin, ou vers soi-même. Réservé aux admins — un coach ne doit pas pouvoir
 * se débarrasser d'un joueur ni s'en attribuer un.
 *
 * `players.coach_id` est protégée par un column grant (0002) : l'écriture passe
 * obligatoirement par le service_role, après ce contrôle de rôle.
 *
 * Les notes privées écrites par le coach sortant sont supprimées au passage.
 * La policy `coach_notes_all` donne l'accès via `is_coach_of(player_id)` : sans
 * cette suppression, le coach entrant hériterait de notes confidentielles
 * rédigées par quelqu'un d'autre. Même principe que l'archivage, qui les
 * supprime déjà (trigger de 0003).
 */
export async function reassignPlayer(playerId: string, newCoachId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: player } = await admin
    .from("players")
    .select("coach_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return { ok: false, error: "Joueur introuvable." };
  if (player.coach_id === newCoachId) {
    return { ok: false, error: "Ce joueur est déjà rattaché à ce coach." };
  }

  // Cible obligatoirement membre du staff : un joueur ne peut pas devenir
  // le référent d'un autre joueur.
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", newCoachId)
    .in("role", ["coach", "admin"])
    .maybeSingle();
  if (!target) return { ok: false, error: "Coach de destination introuvable." };

  if (player.coach_id) {
    const { error: notesError } = await admin
      .from("coach_notes")
      .delete()
      .eq("player_id", playerId)
      .eq("author_id", player.coach_id);
    if (notesError) return { ok: false, error: "Nettoyage des notes impossible." };
  }

  const { error } = await admin
    .from("players")
    .update({ coach_id: newCoachId })
    .eq("id", playerId);
  if (error) return { ok: false, error: "Réaffectation impossible." };

  revalidatePath("/coach/club", "layout");
  revalidatePath("/coach/joueurs");
  revalidatePath(`/coach/joueurs/${playerId}`);
  revalidatePath("/coach");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function createInvitation(
  coachId: string,
  playerLabel: string,
  /** offre appliquée à la fiche du joueur qui utilisera le lien */
  offer: PlayerOffer = DEFAULT_OFFER
): Promise<ActionResult & { token?: string }> {
  const guard = await requireStaff();
  if (!guard.ok) return guard;
  // Un coach ne peut inviter que pour lui-même ; l'admin peut cibler n'importe quel coach.
  if (guard.role === "coach" && coachId !== guard.userId) {
    return { ok: false, error: "Accès refusé." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .insert({
      coach_id: coachId,
      created_by: guard.userId,
      player_label: playerLabel.trim(),
      offer: toOffer(offer),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Création impossible." };

  revalidatePath("/coach/club", "layout");
  revalidatePath("/coach/joueurs"); // l'admin invite aussi depuis sa page Joueurs
  return { ok: true, token: data.id };
}

export async function deleteInvitation(invitationId: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  let query = admin.from("invitations").delete().eq("id", invitationId).is("used_at", null);
  // Un coach ne peut supprimer que ses propres invitations ; l'admin toutes.
  if (guard.role === "coach") query = query.eq("coach_id", guard.userId);
  const { error } = await query;
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/coach/club", "layout");
  revalidatePath("/coach/joueurs");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Exclusion : archivage / réactivation
// ---------------------------------------------------------------------------

const BAN_FOREVER = "876000h"; // ~100 ans

/**
 * Archive un joueur : il ne peut plus se connecter (ban auth + contrôle
 * middleware), ses statistiques sont conservées, ses notes coach sont
 * supprimées par le trigger DB.
 */
export async function archivePlayer(playerId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from("players")
    .update({ status: "archived" })
    .eq("id", playerId);
  if (error) return { ok: false, error: "Archivage impossible." };

  await admin.auth.admin.updateUserById(playerId, { ban_duration: BAN_FOREVER });
  // supprime les subscriptions push pour couper les rappels immédiatement
  await admin.from("push_subscriptions").delete().eq("user_id", playerId);

  revalidatePath("/coach/club", "layout");
  revalidatePath("/coach");
  return { ok: true };
}

export async function reactivatePlayer(playerId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from("players")
    .update({ status: "active" })
    .eq("id", playerId);
  if (error) return { ok: false, error: "Réactivation impossible." };

  await admin.auth.admin.updateUserById(playerId, { ban_duration: "none" });

  revalidatePath("/coach/club", "layout");
  revalidatePath("/coach");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bibliothèque de séances (CRUD admin)
// ---------------------------------------------------------------------------

interface SessionData {
  name: string;
  pole: SessionPole;
  /** au moins une catégorie ; plusieurs seulement en préparation physique */
  categories: string[];
  youtube_url: string;
  /** fiche de training déposée dans le bucket "fiches" ; réservée aux admins */
  sheet_url: string;
  duration_minutes: number;
  equipment: string;
  /** postes concernés ; vide = tous les postes */
  positions: string[];
}

/**
 * URL de fiche acceptée : uniquement un objet du bucket "fiches" du projet
 * Supabase. Empêche qu'un champ détourné fasse pointer une séance vers
 * n'importe quelle URL externe.
 */
function isClubSheetUrl(url: string): boolean {
  if (!url) return true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/fiches/`);
}

function validateSession(data: SessionData): string | null {
  if (!data.name.trim()) return "Le nom est obligatoire.";
  if (data.categories.length === 0) return "Choisis au moins une catégorie.";
  if (data.categories.some((c) => !CATEGORIES[data.pole]?.includes(c))) {
    return "Catégorie invalide pour ce pôle.";
  }
  if (!allowsMultipleCategories(data.pole) && data.categories.length > 1) {
    return "Une seule catégorie possible pour ce pôle.";
  }
  if (!Number.isInteger(data.duration_minutes) || data.duration_minutes <= 0) {
    return "Durée invalide.";
  }
  if (data.positions.some((p) => !POSITIONS.includes(p))) return "Poste invalide.";
  return null;
}

/**
 * Admin ou coach pour la bibliothèque : la création est réservée à l'admin,
 * qui gère aussi toute la bibliothèque ; un coach ne peut que modifier ou
 * supprimer les séances qu'il avait créées (les programmes restent intouchables).
 */
async function requireLibrarian(): Promise<
  { ok: true; userId: string; isAdmin: boolean } | { ok: false; error: string }
> {
  const { profile } = await getAuthProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "coach")) {
    return { ok: false, error: "Accès réservé au staff." };
  }
  return { ok: true, userId: profile.id, isAdmin: profile.role === "admin" };
}

/** Erreur si l'appelant n'a pas le droit de modifier/supprimer cette séance. */
async function sessionWriteDenied(
  sessionId: string,
  guard: { userId: string; isAdmin: boolean }
): Promise<string | null> {
  if (guard.isAdmin) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("library_sessions")
    .select("created_by")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return "Séance introuvable.";
  if (data.created_by !== guard.userId) {
    return "Tu ne peux modifier que les séances que tu as créées.";
  }
  return null;
}

export async function createLibrarySession(data: SessionData): Promise<ActionResult> {
  const guard = await requireLibrarian();
  if (!guard.ok) return guard;
  // La bibliothèque est alimentée par le club : un coach affecte et modifie
  // ses propres séances mais n'en crée pas de nouvelles.
  if (!guard.isAdmin) {
    return { ok: false, error: "Seul un administrateur peut créer une séance." };
  }
  const invalid = validateSession(data);
  if (invalid) return { ok: false, error: invalid };

  // un coach ne dépose pas de fiche : le champ est ignoré côté serveur
  const sheet = guard.isAdmin ? data.sheet_url.trim() : "";
  if (!isClubSheetUrl(sheet)) return { ok: false, error: "Fiche invalide." };

  const admin = createAdminClient();
  const { error } = await admin.from("library_sessions").insert({
    name: data.name.trim(),
    pole: data.pole,
    categories: sortCategories(data.pole, data.categories),
    youtube_url: data.youtube_url.trim(),
    sheet_url: sheet,
    duration_minutes: data.duration_minutes,
    equipment: data.equipment.trim(),
    positions: data.positions,
    created_by: guard.userId,
  });
  if (error) return { ok: false, error: "Création impossible." };
  revalidatePath("/coach/bibliotheque");
  return { ok: true };
}

export async function updateLibrarySession(
  sessionId: string,
  data: SessionData
): Promise<ActionResult> {
  const guard = await requireLibrarian();
  if (!guard.ok) return guard;
  const invalid = validateSession(data);
  if (invalid) return { ok: false, error: invalid };
  const denied = await sessionWriteDenied(sessionId, guard);
  if (denied) return { ok: false, error: denied };

  // hors admin, sheet_url n'est pas touché : un coach ne doit pas pouvoir
  // effacer la fiche posée par le club en éditant une séance
  const mediaPatch: { sheet_url?: string } = {};
  if (guard.isAdmin) {
    const sheet = data.sheet_url.trim();
    if (!isClubSheetUrl(sheet)) return { ok: false, error: "Fiche invalide." };
    mediaPatch.sheet_url = sheet;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("library_sessions")
    .update({
      name: data.name.trim(),
      pole: data.pole,
      categories: sortCategories(data.pole, data.categories),
      youtube_url: data.youtube_url.trim(),
      ...mediaPatch,
      duration_minutes: data.duration_minutes,
      equipment: data.equipment.trim(),
      positions: data.positions,
    })
    .eq("id", sessionId);
  if (error) return { ok: false, error: "Modification impossible." };
  revalidatePath("/coach/bibliotheque");
  return { ok: true };
}

export async function deleteLibrarySession(sessionId: string): Promise<ActionResult> {
  const guard = await requireLibrarian();
  if (!guard.ok) return guard;
  const denied = await sessionWriteDenied(sessionId, guard);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { error } = await admin.from("library_sessions").delete().eq("id", sessionId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/coach/bibliotheque");
  return { ok: true };
}
