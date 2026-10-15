import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { getHealthByPlayer, getWeekTracking, type PlayerDiscipline } from "./coach-data";
import { getStaffInbox, getStaffUnreadPlayerIds } from "./conversations";
import {
  buildPlayerAlerts,
  getSessionCoverage,
  rankAlertRows,
  type PlayerAlert,
  type SessionCoverage,
} from "./alerts";
import { suggestForRow } from "./briefing";
import { detectDropout, type DropoutRisk } from "./dropout";
import { addDays, currentWeekStart, parisNow } from "./dates";
import { waMeUrl } from "./whatsapp";
import type { PlayerAvailability, PlayerOffer, ReviewHealthStatus } from "./types";

/**
 * L'état d'un joueur tel que le staff le lit d'un coup d'œil : une ligne de
 * la vue tableau de l'accueil, et la matière première du brief du matin.
 * Tout est sérialisable (la ligne part vers un composant client).
 */
export type ReviewState = "replied" | "to-reply" | "missing" | "none";
export type Trend = "up" | "down" | "stable";

/** Une semaine passée d'un joueur : pointages et bilan. */
export interface WeekCell {
  weekStart: string;
  done: number;
  planned: number;
  review: boolean;
}

export interface MatchPoint {
  date: string;
  points: number;
  minutes: number;
}

/** Semaines d'historique proposées dans le tableau. */
export const HISTORY_WEEK_CHOICES = [8, 13, 26] as const;
export const DEFAULT_HISTORY_WEEKS = 8;

export interface HomeRow {
  id: string;
  firstName: string;
  lastName: string;
  groupId: string | null;
  coachId: string;
  /** prénom du référent, null si c'est le lecteur */
  coachFirstName: string | null;
  offer: PlayerOffer;
  availability: PlayerAvailability;
  discipline: number | null;
  weekPlanned: number;
  weekDone: number;
  /** bilan : répondu, reçu sans réponse, manquant la semaine passée, rien d'attendu */
  review: ReviewState;
  reviewId: string | null;
  reviewHealth: ReviewHealthStatus | null;
  /** extrait du dernier bilan reçu (bien fait / à améliorer), pour le brief */
  reviewExcerpt: string | null;
  /** le dernier bilan reçu en entier (bulle de l'accueil), null si aucun */
  reviewDetail: {
    id: string;
    weekStart: string;
    wentWell: string;
    toImprove: string;
    healthStatus: ReviewHealthStatus | null;
    healthNote: string;
    coachReply: string;
  } | null;
  lastExchangeAt: string | null;
  unread: boolean;
  /** porteur du fil qui attend (null = Global) */
  unreadChannel: string | null;
  lastMessagePreview: string | null;
  coverage: SessionCoverage | null;
  pain: { score: number; at: string } | null;
  energy: { score: number; at: string } | null;
  alerts: PlayerAlert[];
  critical: boolean;
  /** message à trous de la couche 1, s'il y en a un */
  suggestion: { label: string; text: string } | null;
  createdAt: string;
  /** semaines clôturées, de la plus récente à la plus ancienne */
  history: WeekCell[];
  /** tendance de la discipline sur les dernières semaines */
  trend: Trend | null;
  /** décrochage en cours (plusieurs pentes concordantes), null sinon */
  dropout: DropoutRisk | null;
  /** feuilles de match, la plus récente d'abord (10 au plus) */
  matches: MatchPoint[];
  /** tendance du scoring : dernier match contre la moyenne des précédents */
  scoreTrend: Trend | null;
  /** lien WhatsApp du joueur, null sans numéro */
  playerWhatsapp: string | null;
  /** lien WhatsApp d'un parent (le premier qui a un numéro) */
  parentWhatsapp: { url: string; name: string } | null;
  /** visio de départ validée par un admin (0045) */
  kickoffDoneAt: string | null;
  /** la visio de départ concerne ce joueur (arrivé à partir de KICKOFF_FROM) */
  kickoffExpected: boolean;
}

/**
 * La visio de départ ne se suit que pour les joueurs arrivés à partir de
 * cette date (les nouveaux, du groupe B) : les joueurs déjà là ne l'ont pas.
 */
export const KICKOFF_FROM = "2026-10-15";

/** Taux d'une semaine, null si rien n'était prévu. */
function rate(c: WeekCell): number | null {
  return c.planned > 0 ? Math.min(1, c.done / c.planned) : null;
}

/** Les deux semaines récentes contre les deux d'avant : ±10 points = mouvement. */
export function disciplineTrend(history: WeekCell[]): Trend | null {
  const rates = history.slice(0, 4).map(rate).filter((r): r is number => r !== null);
  if (rates.length < 2) return null;
  const recent = rates.slice(0, Math.min(2, rates.length - 1));
  const before = rates.slice(recent.length);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const delta = avg(recent) - avg(before);
  return delta >= 0.1 ? "up" : delta <= -0.1 ? "down" : "stable";
}

/** Le dernier match contre la moyenne des trois d'avant : ±2 points = mouvement. */
export function scoreTrend(matches: MatchPoint[]): Trend | null {
  if (matches.length < 2) return null;
  const prev = matches.slice(1, 4);
  const avg = prev.reduce((s, m) => s + m.points, 0) / prev.length;
  const delta = matches[0].points - avg;
  return delta >= 2 ? "up" : delta <= -2 ? "down" : "stable";
}

interface ReviewRow {
  id: string;
  player_id: string;
  week_start: string;
  coach_reply: string | null;
  health_status: ReviewHealthStatus | null;
  went_well: string | null;
  to_improve: string | null;
  health_note: string | null;
}

/**
 * Les lignes de l'accueil pour ces joueurs, vues par `viewerId`. Les lignes
 * qui demandent quelque chose d'abord (critiques, puis le plus d'alertes,
 * puis A → Z), les joueurs à jour ensuite par prénom.
 */
export async function getHomeRows(
  supabase: SupabaseClient,
  input: { viewerId: string; isAdmin: boolean; players: PlayerDiscipline[]; weeks?: number }
): Promise<HomeRow[]> {
  const { players, viewerId, isAdmin } = input;
  if (players.length === 0) return [];
  const ids = players.map((p) => p.id);
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const nowIso = new Date().toISOString();
  const coachIds = [...new Set(players.map((p) => p.coach_id))].filter((id) => id !== viewerId);
  const weeks = Math.min(52, Math.max(4, input.weeks ?? DEFAULT_HISTORY_WEEKS));
  const historyWeeks = Array.from({ length: weeks }, (_, i) => addDays(prevWeekStart, -7 * i));
  const oldestWeek = historyWeeks[historyWeeks.length - 1];

  const [
    { data: summaries },
    { data: historyReviews },
    { data: matchRows },
    { data: parentLinks },
    { data: kickoffs },
    { data: energyRows },
  ] = await Promise.all([
    supabase
      .from("weekly_summaries")
      .select("player_id, week_start, planned_count, done_count")
      .in("player_id", ids)
      .gte("week_start", oldestWeek),
    supabase
      .from("weekly_reviews")
      .select("player_id, week_start, went_well, to_improve")
      .in("player_id", ids)
      .gte("week_start", oldestWeek),
    supabase
      .from("match_stats")
      .select("player_id, match_date, points, minutes")
      .in("player_id", ids)
      .order("match_date", { ascending: false })
      .limit(ids.length * 12),
    supabase.from("parent_links").select("player_id, parent_id").in("player_id", ids),
    supabase.from("players").select("id, kickoff_done_at").in("id", ids),
    // énergie des 4 dernières semaines : la pente du décrochage (dropout.ts)
    supabase
      .from("checkins")
      .select("player_id, score, created_at")
      .eq("question", "energy")
      .in("player_id", ids)
      .gte("created_at", new Date(Date.now() - 28 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(ids.length * 8),
  ]);
  // numéros des parents : service_role, les liens ont été lus sous RLS
  const parentIds = [...new Set((parentLinks ?? []).map((l) => l.parent_id as string))];
  const { data: parentProfiles } =
    parentIds.length === 0
      ? { data: [] }
      : await createAdminClient()
          .from("profiles")
          .select("id, first_name, whatsapp_number")
          .in("id", parentIds);
  const parentById = new Map((parentProfiles ?? []).map((p) => [p.id as string, p]));
  const summaryKey = new Map(
    (summaries ?? []).map((s) => [`${s.player_id}|${s.week_start}`, s])
  );
  // longueur de chaque bilan (signes écrits) : un bilan qui raccourcit est un signal
  const reviewChars = new Map(
    (historyReviews ?? []).map((r) => [
      `${r.player_id}|${r.week_start}`,
      `${r.went_well ?? ""}${r.to_improve ?? ""}`.trim().length,
    ])
  );
  const energiesByPlayer = new Map<string, number[]>();
  for (const c of energyRows ?? []) {
    const list = energiesByPlayer.get(c.player_id as string) ?? [];
    list.push(c.score as number);
    energiesByPlayer.set(c.player_id as string, list);
  }
  const kickoffById = new Map(
    (kickoffs ?? []).map((k) => [k.id as string, (k.kickoff_done_at as string | null) ?? null])
  );

  const [tracking, health, coverage, threads, unreadIds, { data: reviews }, { data: coaches }] =
    await Promise.all([
      getWeekTracking(supabase, ids, weekStart),
      getHealthByPlayer(supabase, ids),
      getSessionCoverage(supabase, ids),
      getStaffInbox(supabase, viewerId, isAdmin, ids),
      getStaffUnreadPlayerIds(supabase, viewerId, ids),
      supabase
        .from("weekly_reviews")
        .select("id, player_id, week_start, coach_reply, health_status, health_note, went_well, to_improve")
        .in("week_start", [weekStart, prevWeekStart])
        .in("player_id", ids)
        .order("week_start", { ascending: false }),
      // prénoms des référents : service_role, la RLS de `profiles` ne donne
      // pas à un coach le profil de ses collègues (ids déjà obtenus sous RLS)
      coachIds.length === 0
        ? Promise.resolve({ data: [] })
        : createAdminClient().from("profiles").select("id, first_name").in("id", coachIds),
    ]);

  const coachFirstName = new Map(
    (coaches ?? []).map((c) => [c.id as string, c.first_name as string])
  );

  // fils : le plus récent par joueur, et celui qui attend
  const lastByPlayer = new Map<string, { at: string; body: string | null }>();
  const unreadThread = new Map<string, { channel: string | null; body: string | null; at: string | null }>();
  for (const t of threads) {
    if (t.lastAt) {
      const cur = lastByPlayer.get(t.playerId);
      if (!cur || t.lastAt > cur.at) lastByPlayer.set(t.playerId, { at: t.lastAt, body: t.lastBody });
    }
    if (t.hasUnread && !unreadThread.has(t.playerId)) {
      unreadThread.set(t.playerId, { channel: t.channel, body: t.lastBody, at: t.lastAt });
    }
  }

  // bilans : le plus récent des deux semaines (trié desc), et celui de la semaine passée
  const latestReview = new Map<string, ReviewRow>();
  const hasLastWeek = new Set<string>();
  for (const r of (reviews ?? []) as ReviewRow[]) {
    if (!latestReview.has(r.player_id)) latestReview.set(r.player_id, r);
    if (r.week_start === prevWeekStart) hasLastWeek.add(r.player_id);
  }

  const rows = players.map((p): HomeRow => {
    const t = tracking.get(p.id);
    const h = health.get(p.id) ?? null;
    const latest = latestReview.get(p.id) ?? null;
    const pending = latest && !latest.coach_reply?.trim() ? latest : null;
    const unread = unreadThread.get(p.id);
    const last = lastByPlayer.get(p.id);

    const history: WeekCell[] = historyWeeks.map((ws) => {
      const s = summaryKey.get(`${p.id}|${ws}`);
      return {
        weekStart: ws,
        done: s?.done_count ?? 0,
        planned: s?.planned_count ?? 0,
        review: reviewChars.has(`${p.id}|${ws}`),
      };
    });
    const dropout = detectDropout({
      availability: p.availability,
      createdAt: p.created_at,
      nowIso,
      weeks: history.map((w) => ({
        ...w,
        reviewChars: reviewChars.get(`${p.id}|${w.weekStart}`) ?? null,
      })),
      energies: energiesByPlayer.get(p.id) ?? [],
      lastExchangeAt: last?.at ?? null,
    });

    const alerts = buildPlayerAlerts({
      player: p,
      hasUnread: unreadIds.has(p.id),
      unreadAt: unread?.at ?? null,
      pendingReviewId: pending?.id ?? null,
      health: h,
      coverage: coverage.get(p.id) ?? null,
      lastMessageAt: last?.at ?? null,
      hasLastWeekReview: hasLastWeek.has(p.id),
      weekStart,
      dropoutReasons: dropout?.reasons ?? null,
      nowIso,
    });
    const suggestion = suggestForRow(alerts, p);

    let review: ReviewState = "none";
    if (pending) review = "to-reply";
    else if (latest) review = "replied";
    else if (alerts.some((a) => a.key === "review-missing")) review = "missing";

    const excerpt = latest
      ? [latest.went_well?.trim(), latest.to_improve?.trim()].filter(Boolean).join(" / ")
      : "";

    const matches: MatchPoint[] = (matchRows ?? [])
      .filter((m) => m.player_id === p.id)
      .slice(0, 10)
      .map((m) => ({ date: m.match_date, points: m.points, minutes: m.minutes }));
    const parent = (parentLinks ?? [])
      .filter((l) => l.player_id === p.id)
      .map((l) => parentById.get(l.parent_id as string))
      .map((pp) => (pp ? { url: waMeUrl(pp.whatsapp_number as string), name: pp.first_name as string } : null))
      .find((x) => x && x.url);

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      groupId: p.group_id,
      coachId: p.coach_id,
      coachFirstName: p.coach_id === viewerId ? null : (coachFirstName.get(p.coach_id) ?? null),
      offer: p.offer,
      availability: p.availability,
      discipline: p.discipline,
      weekPlanned: t?.planned ?? 0,
      weekDone: t?.done ?? 0,
      review,
      reviewId: latest?.id ?? null,
      reviewHealth: latest?.health_status ?? null,
      reviewExcerpt: excerpt ? excerpt.slice(0, 240) : null,
      reviewDetail: latest
        ? {
            id: latest.id,
            weekStart: latest.week_start,
            wentWell: latest.went_well ?? "",
            toImprove: latest.to_improve ?? "",
            healthStatus: latest.health_status ?? null,
            healthNote: latest.health_note ?? "",
            coachReply: latest.coach_reply ?? "",
          }
        : null,
      lastExchangeAt: last?.at ?? null,
      unread: unreadIds.has(p.id),
      unreadChannel: unread?.channel ?? null,
      lastMessagePreview: (unread?.body ?? last?.body ?? null)?.slice(0, 160) ?? null,
      coverage: coverage.get(p.id) ?? null,
      pain: h?.pain ?? null,
      energy: h?.energy ?? null,
      alerts,
      critical: alerts.some((a) => a.severity === "danger"),
      suggestion: suggestion ? { label: suggestion.alert.label, text: suggestion.text } : null,
      createdAt: p.created_at,
      history,
      trend: disciplineTrend(history),
      dropout,
      matches,
      scoreTrend: scoreTrend(matches),
      playerWhatsapp: waMeUrl(p.whatsapp_number),
      parentWhatsapp: parent ? { url: parent.url!, name: parent.name } : null,
      kickoffDoneAt: kickoffById.get(p.id) ?? null,
      kickoffExpected: parisNow(new Date(p.created_at)).date >= KICKOFF_FROM,
    };
  });

  const byId = new Map(players.map((p) => [p.id, p]));
  const ranked = rankAlertRows(
    rows.map((r) => ({ player: byId.get(r.id)!, alerts: r.alerts, critical: r.critical }))
  ).map((x) => x.player.id);
  const rank = new Map(ranked.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.firstName.localeCompare(b.firstName, "fr");
  });
}
