"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth";
import { logStaffAction } from "@/lib/journal";
import type { ActionResult } from "@/lib/types";

/**
 * Groupes de suivi (0040) : création, staff, affectation d'un joueur. Réservé
 * aux admins — c'est l'organisation du service, pas le quotidien d'un coach.
 * Tout passe par le service_role après vérification du rôle : `group_id`
 * n'est pas accordé aux clients, comme `coach_id`.
 */
async function requireAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Accès réservé à l'admin." };
  }
  return { ok: true, adminId: profile.id };
}

function revalidateGroups() {
  revalidatePath("/coach/admin");
  revalidatePath("/coach");
  revalidatePath("/coach/joueurs");
}

export async function createGroup(name: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Donne un nom au groupe." };

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("groups")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin
    .from("groups")
    .insert({ name: clean, position: (last?.position ?? -1) + 1 });
  if (error) return { ok: false, error: "Création impossible." };

  await logStaffAction({
    actorId: guard.adminId,
    playerId: null,
    action: "group_create",
    summary: `a créé le ${clean}`,
  });
  revalidateGroups();
  return { ok: true };
}

export async function renameGroup(groupId: string, name: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Donne un nom au groupe." };

  const admin = createAdminClient();
  const { data: renamed, error } = await admin
    .from("groups")
    .update({ name: clean })
    .eq("id", groupId)
    .select("id");
  if (error || !renamed || renamed.length === 0) return { ok: false, error: "Renommage impossible." };

  await logStaffAction({
    actorId: guard.adminId,
    playerId: null,
    action: "group_rename",
    summary: `a renommé un groupe en « ${clean} »`,
  });
  revalidateGroups();
  return { ok: true };
}

/**
 * Supprime un groupe VIDE : les joueurs doivent d'abord être déplacés. La
 * base le garantit aussi (FK `on delete restrict`, 0041) — la vérification
 * ici ne sert qu'à dire pourquoi, le refus de Postgres restant le verrou.
 */
export async function deleteGroup(groupId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { count } = await admin
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "active");
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Déplace d'abord les joueurs de ce groupe." };
  }
  const { data: others } = await admin
    .from("groups")
    .select("id")
    .neq("id", groupId)
    .order("position")
    .order("created_at")
    .limit(1);
  const fallback = others?.[0]?.id as string | undefined;
  if (!fallback) return { ok: false, error: "Il faut garder au moins un groupe." };

  // les joueurs archivés du groupe (invisibles, non déplaçables depuis l'UI)
  // rejoignent le premier autre groupe : la FK `restrict` bloquerait sinon
  await admin.from("players").update({ group_id: fallback }).eq("group_id", groupId);

  const { data: group } = await admin.from("groups").select("name").eq("id", groupId).maybeSingle();
  const { error } = await admin.from("groups").delete().eq("id", groupId);
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23503"
          ? "Déplace d'abord les joueurs de ce groupe."
          : "Suppression impossible.",
    };
  }
  await logStaffAction({
    actorId: guard.adminId,
    playerId: null,
    action: "group_delete",
    summary: `a supprimé le ${group?.name ?? "groupe"}`,
  });
  revalidateGroups();
  return { ok: true };
}

/** Ajoute ou retire un membre du staff (coach ou admin) d'un groupe. */
export async function setGroupStaff(
  groupId: string,
  profileId: string,
  member: boolean
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const [{ data: profile }, { data: group }] = await Promise.all([
    admin.from("profiles").select("first_name, role").eq("id", profileId).maybeSingle(),
    admin.from("groups").select("name").eq("id", groupId).maybeSingle(),
  ]);
  if (!profile || (profile.role !== "coach" && profile.role !== "admin")) {
    return { ok: false, error: "Seul un membre du staff peut encadrer un groupe." };
  }
  if (!group) return { ok: false, error: "Groupe introuvable." };

  const { error } = member
    ? await admin
        .from("group_staff")
        .upsert({ group_id: groupId, profile_id: profileId }, { onConflict: "group_id,profile_id" })
    : await admin.from("group_staff").delete().eq("group_id", groupId).eq("profile_id", profileId);
  if (error) return { ok: false, error: "Modification impossible." };

  await logStaffAction({
    actorId: guard.adminId,
    playerId: null,
    action: member ? "group_staff_add" : "group_staff_remove",
    summary: member
      ? `a ajouté ${profile.first_name} au staff du ${group.name}`
      : `a retiré ${profile.first_name} du staff du ${group.name}`,
  });
  revalidateGroups();
  return { ok: true };
}

/** Déplace un joueur dans un autre groupe. Aucune donnée ne bouge. */
export async function setPlayerGroup(playerId: string, groupId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const [{ data: group }, { data: profile }] = await Promise.all([
    admin.from("groups").select("name").eq("id", groupId).maybeSingle(),
    admin.from("profiles").select("first_name, last_name").eq("id", playerId).maybeSingle(),
  ]);
  if (!group) return { ok: false, error: "Groupe introuvable." };

  const { data: moved, error } = await admin
    .from("players")
    .update({ group_id: groupId })
    .eq("id", playerId)
    .neq("group_id", groupId)
    .select("id");
  if (error) return { ok: false, error: "Déplacement impossible." };
  // zéro ligne : joueur inconnu, ou déjà dans ce groupe — rien à journaliser
  if (!moved || moved.length === 0) return { ok: true };

  await logStaffAction({
    actorId: guard.adminId,
    playerId,
    action: "player_group",
    summary: `a placé ${profile?.first_name ?? "un joueur"} ${profile?.last_name ?? ""} dans le ${group.name}`.trim(),
  });
  revalidateGroups();
  revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true };
}
