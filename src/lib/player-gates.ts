import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, currentWeekStart, daysBetween, formatWeekRangeFr, parisNow } from "./dates";
import { GATES_FROM_WEEK } from "./constants";

/**
 * Les « portes » de l'espace joueur (0043/0044) : ce qui s'ouvre tout seul
 * et attend une réponse. Le bilan de la semaine dès le dimanche 18 h (puis
 * en rattrapage la semaine suivante), la feuille de match le week-end dès le
 * samedi 18 h. Mêmes règles pour le pop-up et pour les rappels automatiques
 * du cron : c'est ce fichier qui les porte, pas les écrans.
 *
 * Un joueur blessé ou en vacances n'est jamais sollicité ; un compte tout
 * neuf non plus. Rien avant GATES_FROM_WEEK : les semaines d'avant la règle
 * ne se rattrapent pas.
 */
export const REVIEW_DUE_HOUR = 18;
export const MATCH_ASK_HOUR = 18;
/** Un compte doit avoir vécu au moins ce nombre de jours avant qu'on exige quoi que ce soit. */
const MIN_ACCOUNT_DAYS = 3;

export type MatchWeekendAnswer = "not_played" | "tomorrow" | "no_match";
export const MATCH_WEEKEND_ANSWERS: MatchWeekendAnswer[] = ["not_played", "tomorrow", "no_match"];

/**
 * Attend-on le bilan de cette semaine de ce joueur ? Un compte doit avoir
 * vécu quelques jours, et avoir rejoint la semaine au plus tard le mercredi.
 * Même règle pour la porte et pour le rappel du dimanche.
 */
export function reviewExpectedFor(createdDate: string, weekStart: string, today: string): boolean {
  return (
    weekStart >= GATES_FROM_WEEK &&
    daysBetween(createdDate, today) >= MIN_ACCOUNT_DAYS &&
    createdDate <= addDays(weekStart, 2)
  );
}

/** Demande-t-on sa feuille de match du week-end à ce joueur ? */
export function matchExpectedFor(createdDate: string, weekStart: string, today: string): boolean {
  return weekStart >= GATES_FROM_WEEK && daysBetween(createdDate, today) >= MIN_ACCOUNT_DAYS;
}

/** Le week-end, vu de la feuille de match : samedi dès 18 h, puis tout le dimanche. */
export function isMatchWeekend(now: { isoWeekday: number; minutesOfDay: number }): boolean {
  return (now.isoWeekday === 6 && now.minutesOfDay >= MATCH_ASK_HOUR * 60) || now.isoWeekday === 7;
}

export interface DueReview {
  weekStart: string;
  /** « du 6 au 12 octobre » */
  weekLabel: string;
  isCatchUp: boolean;
}

export interface DueMatch {
  weekStart: string;
  /** samedi et dimanche de la semaine, pour la date de la feuille */
  saturday: string;
  sunday: string;
  /** on est dimanche : plus de « match demain » */
  isSunday: boolean;
  /** le joueur avait dit « mon match est demain » samedi */
  deferred: boolean;
}

/** Ce qui s'ouvre pour ce joueur maintenant : le bilan d'abord, puis la feuille de match. */
export async function getPlayerGates(
  supabase: SupabaseClient,
  playerId: string
): Promise<{ review: DueReview | null; match: DueMatch | null }> {
  const now = parisNow();
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const saturday = addDays(weekStart, 5);
  const sunday = addDays(weekStart, 6);

  const [{ data: player }, { data: reviews }, { data: answer }, { data: sheets }] =
    await Promise.all([
      supabase.from("players").select("availability, created_at").eq("id", playerId).maybeSingle(),
      supabase
        .from("weekly_reviews")
        .select("week_start")
        .eq("player_id", playerId)
        .in("week_start", [weekStart, prevWeekStart]),
      supabase
        .from("match_weekend_answers")
        .select("answer")
        .eq("player_id", playerId)
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase
        .from("match_stats")
        .select("match_date")
        .eq("player_id", playerId)
        .gte("match_date", saturday)
        .lte("match_date", sunday),
    ]);
  if (!player || (player.availability ?? "available") !== "available") {
    return { review: null, match: null };
  }
  const createdDate = parisNow(new Date(player.created_at)).date;
  const has = new Set((reviews ?? []).map((r) => r.week_start as string));

  // ---- le bilan : dimanche dès 18 h pour la semaine en cours, sinon le
  //      rattrapage de la semaine passée tant qu'il manque
  let review: DueReview | null = null;
  const sundayEvening = now.isoWeekday === 7 && now.minutesOfDay >= REVIEW_DUE_HOUR * 60;
  if (sundayEvening) {
    if (!has.has(weekStart) && reviewExpectedFor(createdDate, weekStart, now.date)) {
      review = { weekStart, weekLabel: formatWeekRangeFr(weekStart), isCatchUp: false };
    }
  } else if (
    !has.has(prevWeekStart) &&
    reviewExpectedFor(createdDate, prevWeekStart, now.date) &&
    createdDate <= addDays(prevWeekStart, 6)
  ) {
    review = { weekStart: prevWeekStart, weekLabel: formatWeekRangeFr(prevWeekStart), isCatchUp: true };
  }

  // ---- la feuille de match : le week-end, tant que ni feuille ni réponse ;
  //      « match demain » redemande le dimanche 18 h, avec le bilan
  let match: DueMatch | null = null;
  const hasSheet = (sheets ?? []).length > 0;
  const given = (answer?.answer as MatchWeekendAnswer | undefined) ?? null;
  if (isMatchWeekend(now) && !hasSheet && matchExpectedFor(createdDate, weekStart, now.date)) {
    const isSunday = now.isoWeekday === 7;
    if (given === null) {
      match = { weekStart, saturday, sunday, isSunday, deferred: false };
    } else if (given === "tomorrow" && sundayEvening) {
      match = { weekStart, saturday, sunday, isSunday, deferred: true };
    }
  }

  return { review, match };
}
