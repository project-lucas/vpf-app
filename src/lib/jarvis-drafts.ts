import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Les brouillons de Jarvis (0046) : ce qu'il a préparé et que le staff valide
 * dans la file « Aujourd'hui ». Écrits par `jarvis-work.ts` (service_role),
 * lus ici sous RLS (staff du joueur, admins).
 */
export type DraftKind = "review_reply" | "visio" | "parent_report";
export type DraftStatus = "pending" | "sent" | "dismissed" | "error";

export interface JarvisDraft {
  id: string;
  kind: DraftKind;
  player_id: string;
  review_id: string | null;
  period: string;
  body: string;
  reason: string;
  status: DraftStatus;
  created_at: string;
}

/** Minutes estimées par geste : ce qui donne « 12 actions, ~25 min ». */
export const TASK_MINUTES = {
  message: 3,
  review: 1,
  visio: 3,
  program: 1,
  report: 1,
} as const;

/** Les brouillons de ces joueurs, pour ces natures et ces périodes. */
export async function getDrafts(
  supabase: SupabaseClient,
  input: { playerIds: string[]; kinds: DraftKind[]; periods?: string[]; statuses?: DraftStatus[] }
): Promise<JarvisDraft[]> {
  if (input.playerIds.length === 0) return [];
  let q = supabase
    .from("jarvis_drafts")
    .select("id, kind, player_id, review_id, period, body, reason, status, created_at")
    .in("player_id", input.playerIds)
    .in("kind", input.kinds)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (input.periods) q = q.in("period", input.periods);
  if (input.statuses) q = q.in("status", input.statuses);
  const { data } = await q;
  return (data ?? []) as JarvisDraft[];
}

/** Le mois précédent au format AAAA-MM (période des rapports aux parents). */
export function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}

/** « octobre 2026 » pour AAAA-MM. */
export function formatMonthFr(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}
