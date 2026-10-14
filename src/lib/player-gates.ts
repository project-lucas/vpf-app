import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  currentWeekStart,
  daysBetween,
  formatWeekRangeFr,
  parisNow,
  timeToMinutes,
} from "./dates";
import { matchDayLabel } from "./automations";

/**
 * Les « portes » de l'espace joueur (0043) : ce qui bloque l'écran tant que
 * ce n'est pas rempli. Le bilan de la semaine dès le dimanche 18 h (puis en
 * rattrapage toute la semaine suivante), la feuille de match après un match
 * du planning. Même règles pour le pop-up et pour le rappel automatique du
 * cron : c'est ce fichier qui les porte, pas les écrans.
 *
 * Un joueur blessé ou en vacances n'est jamais bloqué ; un compte tout neuf
 * non plus (il n'avait pas de semaine à raconter).
 */
export const REVIEW_DUE_HOUR = 18;
/** Après le coup d'envoi : la durée du match, puis le temps de rentrer. */
export const MATCH_GRACE_MINUTES = 60;
export const DEFAULT_MATCH_MINUTES = 90;
/** Un compte doit avoir vécu au moins ce nombre de jours avant qu'on exige un bilan. */
const MIN_ACCOUNT_DAYS = 3;

/**
 * Attend-on le bilan de cette semaine de ce joueur ? Un compte doit avoir
 * vécu quelques jours, et avoir rejoint la semaine au plus tard le mercredi.
 * Même règle pour la porte et pour le rappel du dimanche.
 */
export function reviewExpectedFor(createdDate: string, weekStart: string, today: string): boolean {
  return daysBetween(createdDate, today) >= MIN_ACCOUNT_DAYS && createdDate <= addDays(weekStart, 2);
}

export interface DueReview {
  weekStart: string;
  /** « du 6 au 12 octobre » */
  weekLabel: string;
  isCatchUp: boolean;
}

export interface MatchEventRow {
  id: string;
  player_id: string;
  weekday: number;
  event_time: string;
  duration_minutes: number | null;
  created_at: string | null;
}

export interface MatchOccurrence {
  eventId: string;
  playerId: string;
  weekStart: string;
  date: string;
}

export interface DueMatch extends MatchOccurrence {
  /** « samedi 18 octobre » */
  dateLabel: string;
}

/**
 * Les matchs du planning déjà joués (coup d'envoi + durée + marge dépassés)
 * sur les semaines données, sans ceux qui n'existaient pas encore ce jour-là.
 */
export function matchOccurrencesDue(
  events: MatchEventRow[],
  now: { date: string; minutesOfDay: number },
  weekStarts: string[]
): MatchOccurrence[] {
  const due: MatchOccurrence[] = [];
  for (const e of events) {
    const createdDate = e.created_at ? parisNow(new Date(e.created_at)).date : null;
    const endMinutes =
      timeToMinutes(e.event_time) + (e.duration_minutes ?? DEFAULT_MATCH_MINUTES) + MATCH_GRACE_MINUTES;
    for (const ws of weekStarts) {
      const date = addDays(ws, e.weekday - 1);
      if (date > now.date) continue;
      if (createdDate && date < createdDate) continue;
      if (date === now.date && now.minutesOfDay < endMinutes) continue;
      due.push({ eventId: e.id, playerId: e.player_id, weekStart: ws, date });
    }
  }
  return due;
}

/**
 * Parmi des matchs joués, ceux qui attendent encore leur feuille : ni feuille
 * saisie ce jour-là, ni « je n'ai pas joué » explicite (pointage not_done
 * posé par le joueur — un not_done matérialisé par le cron ne compte pas).
 */
export function matchesAwaitingSheet(
  occurrences: MatchOccurrence[],
  sheets: { player_id: string; match_date: string }[],
  explicitSkips: { planned_event_id: string; week_start: string }[]
): MatchOccurrence[] {
  const sheetKeys = new Set(sheets.map((s) => `${s.player_id}|${s.match_date}`));
  const skipKeys = new Set(explicitSkips.map((s) => `${s.planned_event_id}|${s.week_start}`));
  return occurrences.filter(
    (o) => !sheetKeys.has(`${o.playerId}|${o.date}`) && !skipKeys.has(`${o.eventId}|${o.weekStart}`)
  );
}

/** Ce qui bloque l'écran de ce joueur maintenant : le bilan d'abord, sinon un match. */
export async function getPlayerGates(
  supabase: SupabaseClient,
  playerId: string
): Promise<{ review: DueReview | null; match: DueMatch | null }> {
  const now = parisNow();
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);

  const [{ data: player }, { data: reviews }, { data: events }] = await Promise.all([
    supabase.from("players").select("availability, created_at").eq("id", playerId).maybeSingle(),
    supabase
      .from("weekly_reviews")
      .select("week_start")
      .eq("player_id", playerId)
      .in("week_start", [weekStart, prevWeekStart]),
    supabase
      .from("planned_events")
      .select("id, player_id, weekday, event_time, duration_minutes, created_at")
      .eq("player_id", playerId)
      .eq("event_type", "match"),
  ]);
  if (!player || (player.availability ?? "available") !== "available") {
    return { review: null, match: null };
  }
  const createdDate = parisNow(new Date(player.created_at)).date;
  const oldEnough = daysBetween(createdDate, now.date) >= MIN_ACCOUNT_DAYS;
  const has = new Set((reviews ?? []).map((r) => r.week_start as string));

  // ---- le bilan : dimanche dès 18 h pour la semaine en cours, sinon le
  //      rattrapage de la semaine passée tant qu'il manque
  let review: DueReview | null = null;
  const sundayEvening = now.isoWeekday === 7 && now.minutesOfDay >= REVIEW_DUE_HOUR * 60;
  if (sundayEvening) {
    if (!has.has(weekStart) && reviewExpectedFor(createdDate, weekStart, now.date)) {
      review = { weekStart, weekLabel: formatWeekRangeFr(weekStart), isCatchUp: false };
    }
  } else if (!has.has(prevWeekStart) && oldEnough && createdDate <= addDays(prevWeekStart, 6)) {
    review = { weekStart: prevWeekStart, weekLabel: formatWeekRangeFr(prevWeekStart), isCatchUp: true };
  }

  // ---- le match : le plus récent qui attend sa feuille
  let match: DueMatch | null = null;
  const occurrences = matchOccurrencesDue((events ?? []) as MatchEventRow[], now, [prevWeekStart, weekStart]);
  if (occurrences.length > 0) {
    const eventIds = [...new Set(occurrences.map((o) => o.eventId))];
    const [{ data: sheets }, { data: skips }] = await Promise.all([
      supabase
        .from("match_stats")
        .select("player_id, match_date")
        .eq("player_id", playerId)
        .gte("match_date", prevWeekStart),
      supabase
        .from("event_completions")
        .select("planned_event_id, week_start")
        .in("planned_event_id", eventIds)
        .in("week_start", [prevWeekStart, weekStart])
        .eq("status", "not_done")
        .eq("auto_filled", false),
    ]);
    const waiting = matchesAwaitingSheet(occurrences, sheets ?? [], skips ?? []).sort((a, b) =>
      a.date < b.date ? 1 : -1
    );
    if (waiting[0]) match = { ...waiting[0], dateLabel: matchDayLabel(waiting[0].date) };
  }

  return { review, match };
}
