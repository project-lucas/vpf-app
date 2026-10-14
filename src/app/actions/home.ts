"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth";
import { logStaffAction } from "@/lib/journal";
import type { ActionResult } from "@/lib/types";

/**
 * La visio de départ (0045) : un admin coche « faite » dans le tableau de
 * l'accueil. Réservé aux admins — c'est eux qui la font.
 */
export async function setKickoffDone(playerId: string, done: boolean): Promise<ActionResult> {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Réservé aux admins." };
  }
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("players")
    .update({
      kickoff_done_at: done ? new Date().toISOString() : null,
      kickoff_done_by: done ? profile.id : null,
    })
    .eq("id", playerId)
    .select("id");
  if (error || !updated || updated.length === 0) {
    return { ok: false, error: "Enregistrement impossible." };
  }

  const { data: p } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", playerId)
    .maybeSingle();
  await logStaffAction({
    actorId: profile.id,
    playerId,
    action: "kickoff",
    summary: `${done ? "a validé" : "a annulé"} la visio de départ de ${`${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim()}`,
  });
  revalidatePath("/coach");
  return { ok: true };
}
