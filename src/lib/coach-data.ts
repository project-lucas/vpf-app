import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, currentWeekStart } from "./dates";

export interface PlayerDiscipline {
  id: string;
  first_name: string;
  last_name: string;
  season_goal: string;
  coach_id: string;
  /** null si aucune donnée exploitable */
  discipline: number | null;
  planningEmpty: boolean;
}

/**
 * Joueurs actifs visibles par l'utilisateur courant (RLS : ses joueurs pour un
 * coach, tous pour l'admin) avec leur score de discipline hebdomadaire :
 * la dernière semaine clôturée si disponible, sinon la semaine en cours.
 */
export async function getPlayersWithDiscipline(
  supabase: SupabaseClient
): Promise<PlayerDiscipline[]> {
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);

  const { data: players } = await supabase
    .from("players")
    .select("id, coach_id, season_goal, profile:profiles!players_id_fkey(first_name, last_name)")
    .eq("status", "active");

  if (!players || players.length === 0) return [];
  const playerIds = players.map((p) => p.id);

  const [{ data: summaries }, { data: plannedEvents }, { data: completions }] = await Promise.all([
    supabase
      .from("weekly_summaries")
      .select("player_id, planned_count, done_count")
      .eq("week_start", prevWeekStart)
      .in("player_id", playerIds),
    supabase.from("planned_events").select("id, player_id").in("player_id", playerIds),
    supabase
      .from("event_completions")
      .select("player_id, status")
      .eq("week_start", weekStart)
      .in("player_id", playerIds),
  ]);

  return players
    .map((p) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      const plannedCount = (plannedEvents ?? []).filter((e) => e.player_id === p.id).length;
      const summary = (summaries ?? []).find((s) => s.player_id === p.id);

      let discipline: number | null = null;
      if (summary && summary.planned_count > 0) {
        discipline = Math.min(1, summary.done_count / summary.planned_count);
      } else if (plannedCount > 0) {
        const done = (completions ?? []).filter(
          (c) => c.player_id === p.id && c.status === "done"
        ).length;
        discipline = Math.min(1, done / plannedCount);
      }

      return {
        id: p.id,
        coach_id: p.coach_id,
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
        season_goal: p.season_goal,
        discipline,
        planningEmpty: plannedCount === 0,
      };
    })
    .sort((a, b) => a.first_name.localeCompare(b.first_name, "fr"));
}

export function averageDiscipline(players: PlayerDiscipline[]): number | null {
  const withScore = players.filter((p) => p.discipline !== null);
  if (withScore.length === 0) return null;
  return withScore.reduce((sum, p) => sum + (p.discipline ?? 0), 0) / withScore.length;
}
