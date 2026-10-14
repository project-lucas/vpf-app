import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, currentWeekStart, formatDateFr } from "./dates";
import { POLE_LABELS } from "./constants";
import { toOffer } from "./offers";
import type {
  MatchStat,
  PlayerAvailability,
  PlayerOffer,
  SessionPole,
  WeeklyReview,
} from "./types";

export interface PlayerDiscipline {
  id: string;
  first_name: string;
  last_name: string;
  /** numéro WhatsApp du joueur, saisi par son coach — vide si non renseigné */
  whatsapp_number: string;
  season_goal: string;
  coach_id: string;
  /** groupe de suivi (0040) */
  group_id: string | null;
  offer: PlayerOffer;
  availability: PlayerAvailability;
  /** null si aucune donnée exploitable */
  discipline: number | null;
  planningEmpty: boolean;
  /** création du compte joueur (ISO) — sert à ne pas alerter sur un compte tout neuf */
  created_at: string;
}

/**
 * Joueurs actifs visibles par l'utilisateur courant (RLS : ses joueurs pour un
 * coach, tous pour l'admin) avec leur score de discipline hebdomadaire :
 * la dernière semaine clôturée si disponible, sinon la semaine en cours.
 *
 * `coachId` restreint aux joueurs de ce coach : indispensable pour les écrans
 * « mes joueurs » d'un admin (la RLS lui renvoie TOUS les joueurs du club).
 */
export async function getPlayersWithDiscipline(
  supabase: SupabaseClient,
  coachId?: string
): Promise<PlayerDiscipline[]> {
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);

  let query = supabase
    .from("players")
    .select(
      "id, coach_id, group_id, season_goal, availability, offer, created_at, profile:profiles!players_id_fkey(first_name, last_name, whatsapp_number)"
    )
    .eq("status", "active");
  if (coachId) query = query.eq("coach_id", coachId);

  const { data: players } = await query;

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
        group_id: (p.group_id as string | null) ?? null,
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
        whatsapp_number: profile?.whatsapp_number ?? "",
        season_goal: p.season_goal,
        offer: toOffer(p.offer),
        availability: (p.availability ?? "available") as PlayerAvailability,
        discipline,
        planningEmpty: plannedCount === 0,
        created_at: p.created_at,
      };
    })
    .sort((a, b) => a.first_name.localeCompare(b.first_name, "fr"));
}

/** Moyenne de discipline — les joueurs blessés/en vacances n'entrent pas dans le calcul. */
export function averageDiscipline(players: PlayerDiscipline[]): number | null {
  const withScore = players.filter(
    (p) => p.discipline !== null && p.availability === "available"
  );
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

// ---------------------------------------------------------------------------
// Vues de la liste unique des joueurs : santé et semaine en cours. Une seule
// liste dans toute l'app, trois colonnes commutables — ces deux helpers
// fournissent les deux colonnes qui ne sont pas la discipline.
// ---------------------------------------------------------------------------

export interface HealthEntry {
  energy: { score: number; at: string } | null;
  pain: { score: number; at: string } | null;
}

/** Dernier check-in énergie et douleurs de chaque joueur. */
export async function getHealthByPlayer(
  supabase: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, HealthEntry>> {
  const health = new Map<string, HealthEntry>();
  if (playerIds.length === 0) return health;

  const { data: checkins } = await supabase
    .from("checkins")
    .select("player_id, question, score, created_at")
    .in("player_id", playerIds)
    .order("created_at", { ascending: false })
    .limit(200);

  for (const c of checkins ?? []) {
    const entry = health.get(c.player_id) ?? { energy: null, pain: null };
    const key = c.question === "energy" ? "energy" : "pain";
    if (!entry[key]) entry[key] = { score: c.score, at: c.created_at };
    health.set(c.player_id, entry);
  }
  return health;
}

export interface WeekTracking {
  /** événements de la semaine : pointés + prévus pas encore pointés */
  planned: number;
  done: number;
  /** points de la feuille de match de la semaine, null si aucune */
  sheetPoints: number | null;
  hasReview: boolean;
}

/**
 * Suivi de la semaine en cours par joueur : pointages, feuille de match, bilan.
 * Même décompte que le planning coach — un événement de la semaine type non
 * pointé compte comme prévu, un pointage fait comme réalisé.
 */
export async function getWeekTracking(
  supabase: SupabaseClient,
  playerIds: string[],
  weekStart: string
): Promise<Map<string, WeekTracking>> {
  const tracking = new Map<string, WeekTracking>();
  if (playerIds.length === 0) return tracking;

  const [{ data: events }, { data: completions }, { data: sheets }, { data: reviews }] =
    await Promise.all([
      supabase.from("planned_events").select("id, player_id").in("player_id", playerIds),
      supabase
        .from("event_completions")
        .select("player_id, planned_event_id, status")
        .eq("week_start", weekStart)
        .in("player_id", playerIds),
      supabase
        .from("match_stats")
        .select("player_id, points")
        .gte("match_date", weekStart)
        .lte("match_date", addDays(weekStart, 6))
        .in("player_id", playerIds),
      supabase
        .from("weekly_reviews")
        .select("player_id")
        .eq("week_start", weekStart)
        .in("player_id", playerIds),
    ]);

  for (const id of playerIds) {
    tracking.set(id, { planned: 0, done: 0, sheetPoints: null, hasReview: false });
  }
  const pointed = new Set((completions ?? []).map((c) => c.planned_event_id).filter(Boolean));

  for (const c of completions ?? []) {
    const t = tracking.get(c.player_id);
    if (!t) continue;
    t.planned += 1;
    if (c.status === "done") t.done += 1;
  }
  for (const e of events ?? []) {
    const t = tracking.get(e.player_id);
    if (t && !pointed.has(e.id)) t.planned += 1;
  }
  for (const s of sheets ?? []) {
    const t = tracking.get(s.player_id);
    if (t && t.sheetPoints === null) t.sheetPoints = s.points;
  }
  for (const r of reviews ?? []) {
    const t = tracking.get(r.player_id);
    if (t) t.hasReview = true;
  }
  return tracking;
}
