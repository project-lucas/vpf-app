"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

/** 2 comptes parents max par joueur (liens actifs + invitations en attente). */
const MAX_PARENTS_PER_PLAYER = 2;

type CreateInvitationResult = { ok: true; invitationId: string } | { ok: false; error: string };

/**
 * Création d'un lien d'invitation parent depuis la fiche du joueur.
 * L'autorisation passe par une lecture RLS de la fiche (seuls le coach référent
 * et l'admin la voient) ; l'écriture par le service_role, comme les invitations
 * joueur. La borne « 2 parents max » compte liens actifs ET invitations en
 * attente pour ne pas sur-inviter.
 */
export async function createParentInvitation(
  playerId: string,
  label: string
): Promise<CreateInvitationResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };
  if (user.id === playerId) return { ok: false, error: "Réservé au coach." };

  const { data: row } = await supabase
    .from("players")
    .select("id")
    .eq("id", playerId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Joueur introuvable." };

  const admin = createAdminClient();
  const [{ count: linkCount }, { count: pendingCount }] = await Promise.all([
    admin
      .from("parent_links")
      .select("parent_id", { count: "exact", head: true })
      .eq("player_id", playerId),
    admin
      .from("parent_invitations")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId)
      .is("used_at", null),
  ]);

  if ((linkCount ?? 0) + (pendingCount ?? 0) >= MAX_PARENTS_PER_PLAYER) {
    return {
      ok: false,
      error: "Deux comptes parents maximum par joueur (liens et invitations comprises).",
    };
  }

  const { data: created, error } = await admin
    .from("parent_invitations")
    .insert({ player_id: playerId, created_by: user.id, label: label.trim().slice(0, 60) })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "Création impossible." };

  revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true, invitationId: created.id };
}

/** Révocation d'une invitation parent non utilisée. */
export async function deleteParentInvitation(
  invitationId: string,
  playerId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // lecture RLS de la fiche = preuve d'autorisation (coach référent ou admin)
  const { data: row } = await supabase
    .from("players")
    .select("id")
    .eq("id", playerId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Joueur introuvable." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("parent_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("player_id", playerId)
    .is("used_at", null);
  if (error) return { ok: false, error: "Suppression impossible." };

  revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true };
}

/**
 * Retrait d'un compte parent : le lien saute, le parent ne voit plus rien
 * (son compte reste, sans accès). Réversible en le ré-invitant.
 */
export async function removeParentLink(
  parentId: string,
  playerId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: row } = await supabase
    .from("players")
    .select("id")
    .eq("id", playerId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Joueur introuvable." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("parent_links")
    .delete()
    .eq("parent_id", parentId)
    .eq("player_id", playerId);
  if (error) return { ok: false, error: "Retrait impossible." };

  revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true };
}
