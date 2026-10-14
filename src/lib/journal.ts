import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import type { JournalActorKind, StaffJournalEntry } from "./types";

/**
 * Le journal du staff : « qui a fait quoi », une ligne par geste qui compte
 * (prise en charge, réponse à un bilan, message, séance affectée, changement
 * de disponibilité…). Le passage automatique du matin y écrira au même
 * niveau que les humains (`actor_kind = "claude"`).
 *
 * L'écriture passe par le service_role : le journal n'a pas de policy
 * d'insertion client, c'est l'action serveur qui a déjà prouvé le droit.
 * Une écriture ratée ne fait jamais échouer le geste qu'elle décrit.
 */

/** Un échange suivi ne fait qu'une ligne : les messages se regroupent sur une heure. */
const MESSAGE_DEDUPE_MINUTES = 60;

export async function logStaffAction(entry: {
  actorId: string | null;
  actorKind?: JournalActorKind;
  playerId: string | null;
  action: string;
  /** la phrase sans son sujet : « a répondu au bilan de Théo » */
  summary: string;
  /**
   * Ne pas réécrire la même ligne (même auteur, joueur, nature) si elle
   * existe déjà depuis moins de N minutes — pour les gestes répétitifs
   * (vingt messages d'une conversation n'ont pas à noyer le journal).
   */
  dedupeMinutes?: number;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    if (entry.dedupeMinutes && entry.actorId) {
      const since = new Date(Date.now() - entry.dedupeMinutes * 60_000).toISOString();
      let recent = admin
        .from("staff_journal")
        .select("id")
        .eq("actor_id", entry.actorId)
        .eq("action", entry.action)
        .gte("created_at", since)
        .limit(1);
      recent = entry.playerId ? recent.eq("player_id", entry.playerId) : recent.is("player_id", null);
      const { data } = await recent;
      if (data && data.length > 0) return;
    }
    await admin.from("staff_journal").insert({
      actor_id: entry.actorId,
      actor_kind: entry.actorKind ?? "staff",
      player_id: entry.playerId,
      action: entry.action.slice(0, 40),
      summary: entry.summary.slice(0, 300),
    });
  } catch {
    // le journal est un confort, jamais un verrou
  }
}

/** Journalise un message du staff à un joueur, regroupé par heure. */
export function logStaffMessage(entry: {
  actorId: string;
  playerId: string;
  playerFirstName: string;
  isPrivate: boolean;
}): Promise<void> {
  return logStaffAction({
    actorId: entry.actorId,
    playerId: entry.playerId,
    // un envoi dans un fil privé porte sa propre nature : le journal (0041)
    // ne le montre qu'aux admins et à son auteur, comme le fil lui-même
    action: entry.isPrivate ? "message_private" : "message_sent",
    summary: `a écrit à ${entry.playerFirstName}${entry.isPrivate ? " (fil privé)" : ""}`,
    dedupeMinutes: MESSAGE_DEDUPE_MINUTES,
  });
}

export interface JournalEntryView extends StaffJournalEntry {
  /** « Maxime », « Claude », « VPF » */
  actorName: string;
}

/**
 * Les dernières entrées lisibles par l'utilisateur (RLS), les plus récentes
 * d'abord. Les prénoms des auteurs passent par le service_role : la RLS de
 * `profiles` ne donne pas à un coach le profil de ses collègues, et un journal
 * qui dit « Staff a répondu » ne dit rien. Seuls les auteurs des lignes déjà
 * obtenues sous RLS sont résolus.
 */
export async function getRecentJournal(
  supabase: SupabaseClient,
  limit = 30
): Promise<JournalEntryView[]> {
  const { data } = await supabase
    .from("staff_journal")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const entries = (data ?? []) as StaffJournalEntry[];

  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter((id): id is string => !!id))];
  const { data: actors } =
    actorIds.length === 0
      ? { data: [] }
      : await createAdminClient().from("profiles").select("id, first_name").in("id", actorIds);
  const firstName = new Map((actors ?? []).map((a) => [a.id as string, a.first_name as string]));

  return entries.map((entry) => ({
    ...entry,
    actorName:
      entry.actor_kind === "claude"
        ? "Claude"
        : entry.actor_kind === "system"
          ? "VPF"
          : (entry.actor_id && firstName.get(entry.actor_id)) || "Staff",
  }));
}
