import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, currentWeekStart, formatDateFr } from "./dates";
import { POLE_LABELS } from "./constants";
import type { MatchStat, SessionPole, WeeklyReview } from "./types";

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

// ---------------------------------------------------------------------------
// Vue d'ensemble coach : tout ce que les joueurs remontent (feuilles de match,
// bilans hebdo, séances terminées, check-ins) agrégé pour le dashboard.
// ---------------------------------------------------------------------------

export interface MatchSheetWithPlayer extends MatchStat {
  playerName: string;
}

export interface ReviewWithPlayer extends WeeklyReview {
  playerName: string;
}

export type ActivityKind = "match" | "review" | "session" | "checkin";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  playerId: string;
  playerName: string;
  /** timestamp ISO de la remontée (tri du flux) */
  at: string;
  label: string;
  detail: string;
}

export interface CoachOverview {
  /** feuilles de match depuis le lundi de la semaine passée, plus récentes d'abord */
  matchSheets: MatchSheetWithPlayer[];
  /** bilans hebdo des semaines courante et passée */
  reviews: ReviewWithPlayer[];
  /** 12 dernières remontées joueurs, tous types confondus */
  activity: ActivityItem[];
}

export async function getCoachOverview(
  supabase: SupabaseClient,
  players: PlayerDiscipline[]
): Promise<CoachOverview> {
  if (players.length === 0) return { matchSheets: [], reviews: [], activity: [] };

  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const ids = players.map((p) => p.id);
  const nameOf = new Map(players.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  const [{ data: stats }, { data: reviews }, { data: sessions }, { data: checkins }] =
    await Promise.all([
      supabase
        .from("match_stats")
        .select("*")
        .in("player_id", ids)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("weekly_reviews")
        .select("*")
        .in("player_id", ids)
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("session_completions")
        .select(
          "id, player_id, comment, challenge_score, updated_at, assignment:session_assignments(session:library_sessions(name, pole))"
        )
        .in("player_id", ids)
        .eq("status", "done")
        .order("updated_at", { ascending: false })
        .limit(15),
      supabase
        .from("checkins")
        .select("*")
        .in("player_id", ids)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  const matchSheets: MatchSheetWithPlayer[] = ((stats ?? []) as MatchStat[]).map((s) => ({
    ...s,
    playerName: nameOf.get(s.player_id) ?? "",
  }));

  const reviewsWithPlayer: ReviewWithPlayer[] = ((reviews ?? []) as WeeklyReview[]).map((r) => ({
    ...r,
    playerName: nameOf.get(r.player_id) ?? "",
  }));

  const activity: ActivityItem[] = [
    ...matchSheets.map((s) => ({
      id: `match-${s.id}`,
      kind: "match" as const,
      playerId: s.player_id,
      playerName: s.playerName,
      at: s.created_at,
      label: `Feuille de match : ${s.points} pts`,
      detail: `Match du ${formatDateFr(s.match_date)} · ${s.minutes} min · ${
        s.is_starter ? "titulaire" : "remplaçant"
      }`,
    })),
    ...reviewsWithPlayer.map((r) => ({
      id: `review-${r.id}`,
      kind: "review" as const,
      playerId: r.player_id,
      playerName: r.playerName,
      at: r.updated_at,
      label: "Bilan de la semaine envoyé",
      detail: `Semaine du ${formatDateFr(r.week_start)}`,
    })),
    ...(sessions ?? []).map((c) => {
      const assignment = Array.isArray(c.assignment) ? c.assignment[0] : c.assignment;
      const session = Array.isArray(assignment?.session)
        ? assignment?.session[0]
        : assignment?.session;
      const pole = session?.pole as SessionPole | undefined;
      return {
        id: `session-${c.id}`,
        kind: "session" as const,
        playerId: c.player_id,
        playerName: nameOf.get(c.player_id) ?? "",
        at: c.updated_at,
        label: `Séance terminée : ${session?.name ?? "séance"}`,
        detail: [
          pole ? POLE_LABELS[pole] : null,
          c.challenge_score !== null ? `challenge ${c.challenge_score}` : null,
          c.comment || null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    ...(checkins ?? []).map((c) => ({
      id: `checkin-${c.id}`,
      kind: "checkin" as const,
      playerId: c.player_id,
      playerName: nameOf.get(c.player_id) ?? "",
      at: c.created_at,
      label: `Check-in ${c.question === "energy" ? "énergie" : "douleurs"} : ${c.score}/10`,
      detail: "",
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  return {
    matchSheets: matchSheets.filter((s) => s.match_date >= prevWeekStart),
    reviews: reviewsWithPlayer.filter((r) => r.week_start >= prevWeekStart),
    activity,
  };
}
