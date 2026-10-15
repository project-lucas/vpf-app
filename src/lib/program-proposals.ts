import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignedConflicts,
  painZonesFromNotes,
  suggestSessions,
  ZONE_LABELS,
} from "./session-suggestions";
import type { SessionPole } from "./types";

/**
 * Les propositions de programme de la file « Aujourd'hui », à valider d'un
 * coup (« Affecter les 14 ») : pour chaque joueur disponible,
 *  - une séance technique s'il n'en a aucune, une physique s'il n'en a aucune ;
 *  - une routine qui soigne sa zone douloureuse (lue dans ses derniers bilans) ;
 *  - la mise en pause des séances qui chargent cette zone.
 * Le choix vient du moteur de suggestions (poste + douleurs, cf.
 * `session-suggestions.ts`). Rien n'est stocké : on recalcule à chaque
 * lecture, et ce qui est appliqué disparaît de lui-même.
 */

/** Jours posés par défaut sur une proposition (modifiables ensuite dans la fiche). */
export const DEFAULT_DAYS: Record<SessionPole, number[]> = {
  basket: [2, 4],
  physique: [1, 5],
  routine: [1, 2, 3, 4, 5, 6, 7],
};

export type ProgramProposal =
  | {
      kind: "add";
      key: string;
      playerId: string;
      sessionId: string;
      sessionName: string;
      pole: SessionPole;
      weekdays: number[];
      reason: string;
    }
  | {
      kind: "pause";
      key: string;
      playerId: string;
      assignmentIds: string[];
      sessionName: string;
      reason: string;
    };

export async function getProgramProposals(
  supabase: SupabaseClient,
  players: { id: string; availability: string }[]
): Promise<ProgramProposal[]> {
  const ids = players.filter((p) => p.availability === "available").map((p) => p.id);
  if (ids.length === 0) return [];

  const [{ data: assignments }, { data: library }, { data: reviews }, { data: positions }] = await Promise.all([
    supabase
      .from("session_assignments")
      .select("id, player_id, session_id, session:library_sessions!inner(name, pole)")
      .in("player_id", ids)
      .is("removed_at", null),
    supabase.from("library_sessions").select("id, name, pole, duration_minutes"),
    supabase
      .from("weekly_reviews")
      .select("player_id, week_start, health_status, health_note")
      .in("player_id", ids)
      .order("week_start", { ascending: false })
      .limit(ids.length * 3),
    supabase.from("players").select("id, position").in("id", ids),
  ]);

  const positionOf = new Map((positions ?? []).map((p) => [p.id as string, (p.position as string) || null]));
  const out: ProgramProposal[] = [];

  for (const playerId of ids) {
    const mine = (assignments ?? [])
      .filter((a) => a.player_id === playerId)
      .map((a) => {
        const s = Array.isArray(a.session) ? a.session[0] : a.session;
        return { id: a.id as string, sessionId: a.session_id as string, name: s?.name ?? "", pole: s?.pole as SessionPole };
      });
    const painNotes = (reviews ?? [])
      .filter((r) => r.player_id === playerId)
      .slice(0, 3)
      .filter((r) => r.health_status === "gene" || r.health_status === "blessure")
      .map((r) => r.health_note ?? "")
      .filter(Boolean);
    const painZones = painZonesFromNotes(painNotes);
    const suggested = suggestSessions({
      position: positionOf.get(playerId) ?? null,
      painZones,
      assignedSessionIds: new Set(mine.map((m) => m.sessionId)),
      library: library ?? [],
    });

    for (const pole of ["basket", "physique"] as const) {
      const first = suggested[pole][0];
      if (mine.some((m) => m.pole === pole) || !first) continue;
      out.push({
        kind: "add",
        key: `${playerId}:${first.sessionId}`,
        playerId,
        sessionId: first.sessionId,
        sessionName: first.name,
        pole,
        weekdays: DEFAULT_DAYS[pole],
        reason: `Aucune séance ${pole === "basket" ? "technique" : "physique"} · ${first.reason}`,
      });
    }

    const care = suggested.routine.find((s) => s.forPain);
    if (care) {
      out.push({
        kind: "add",
        key: `${playerId}:${care.sessionId}`,
        playerId,
        sessionId: care.sessionId,
        sessionName: care.name,
        pole: "routine",
        weekdays: DEFAULT_DAYS.routine,
        reason: `Douleur signalée (${ZONE_LABELS[care.forPain!]}) · ${care.reason}`,
      });
    }

    for (const conflict of assignedConflicts(
      mine.map((m) => ({ id: m.sessionId, name: m.name })),
      painZones
    )) {
      const assignmentIds = mine.filter((m) => m.name === conflict.name).map((m) => m.id);
      out.push({
        kind: "pause",
        key: `${playerId}:pause:${assignmentIds.join(",")}`,
        playerId,
        assignmentIds,
        sessionName: conflict.name,
        reason: `Charge la zone douloureuse (${ZONE_LABELS[conflict.zone]}) : à mettre en pause`,
      });
    }
  }
  return out;
}
