import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Le brief du matin (0042) : ce que Claude a écrit pour un groupe un jour
 * donné. Lu dans le volet « Claude » de l'accueil ; écrit par
 * `src/lib/morning-brief.ts` (route cron de 7h, ou « Générer maintenant »
 * depuis Admin).
 */

/** Ce qu'une recommandation propose de faire. */
export const BRIEF_ACTIONS = ["message", "open_fiche", "assign_session", "visio", "none"] as const;
export type BriefAction = (typeof BRIEF_ACTIONS)[number];

export interface BriefRecommendation {
  /** joueur concerné, null pour une recommandation sur le groupe */
  playerId: string | null;
  /** « Prendre des nouvelles du genou », « Proposer une visio » */
  title: string;
  /** la raison, en une ou deux phrases */
  why: string;
  /** message prêt à envoyer au joueur (fil Global), null si l'action n'est pas un message */
  message: string | null;
  action: BriefAction;
  /** 1 = maintenant, 2 = cette semaine, 3 = quand tu peux */
  priority: 1 | 2 | 3;
}

export interface StaffBrief {
  id: string;
  group_id: string;
  brief_date: string;
  summary: string;
  recommendations: BriefRecommendation[];
  model: string;
  created_at: string;
}

/** La clé API est-elle posée ? Sans elle, le passage du matin ne tourne pas. */
export function isMorningBriefConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Les briefs d'un jour pour ces groupes, par id de groupe (RLS : staff du groupe, admins). */
export async function getBriefsForDate(
  supabase: SupabaseClient,
  groupIds: string[],
  date: string
): Promise<Map<string, StaffBrief>> {
  const briefs = new Map<string, StaffBrief>();
  if (groupIds.length === 0) return briefs;
  const { data } = await supabase
    .from("staff_briefs")
    .select("*")
    .eq("brief_date", date)
    .in("group_id", groupIds);
  for (const row of (data ?? []) as StaffBrief[]) {
    briefs.set(row.group_id, {
      ...row,
      recommendations: Array.isArray(row.recommendations) ? row.recommendations : [],
    });
  }
  return briefs;
}

/** Le dernier brief de chaque groupe (date), pour l'écran Admin. */
export async function getLastBriefDates(
  supabase: SupabaseClient,
  groupIds: string[]
): Promise<Map<string, string>> {
  const last = new Map<string, string>();
  if (groupIds.length === 0) return last;
  const { data } = await supabase
    .from("staff_briefs")
    .select("group_id, brief_date")
    .in("group_id", groupIds)
    .order("brief_date", { ascending: false })
    .limit(groupIds.length * 4);
  for (const row of data ?? []) {
    if (!last.has(row.group_id)) last.set(row.group_id, row.brief_date);
  }
  return last;
}
