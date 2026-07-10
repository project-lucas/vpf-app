import { addDays } from "./dates";
import type { CompletionStatus, EventCompletion, PlannedEvent } from "./types";

interface CompletionLike {
  status: CompletionStatus;
  week_start: string;
  weekday: number;
  event_time: string;
}

/**
 * Série de JOURS ACTIFS consécutifs : un jour compte dès qu'au moins un de
 * ses pointages est "done" — journée complète ou partielle, la nuance vit
 * dans l'historique (calendrier de discipline). Un jour dont TOUS les
 * pointages sont ratés casse la chaîne ; un jour sans aucun pointage (repos)
 * est neutre : il ne casse pas et ne compte pas. Le cron matérialise chaque
 * nuit les oublis de la veille en "not_done", donc un jour entièrement
 * ignoré casse la série dès le lendemain. La journée en cours compte dès son
 * premier pointage "done" et ne casse jamais (elle n'est pas finie).
 */
export function activeDayStreak(
  completions: { status: CompletionStatus; week_start: string; weekday: number }[],
  today: string
): number {
  const byDate = new Map<string, { done: number; total: number }>();
  let earliest: string | null = null;
  for (const c of completions) {
    const date = addDays(c.week_start, c.weekday - 1);
    if (date > today) continue;
    const entry = byDate.get(date) ?? { done: 0, total: 0 };
    entry.total++;
    if (c.status === "done") entry.done++;
    byDate.set(date, entry);
    if (!earliest || date < earliest) earliest = date;
  }
  if (!earliest) return 0;

  let streak = 0;
  const todayEntry = byDate.get(today);
  if (todayEntry && todayEntry.done > 0) streak++;

  let cursor = addDays(today, -1);
  while (cursor >= earliest) {
    const entry = byDate.get(cursor);
    if (entry) {
      if (entry.done > 0) streak++;
      else break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Taux de réalisation global : réalisations "done" / total des réalisations
 * enregistrées. Les semaines clôturées contiennent une ligne par événement
 * planifié (les oublis sont matérialisés en not_done par le cron) ; la semaine
 * courante ne compte que les événements déjà pointés.
 */
export function globalCompletionRate(completions: { status: CompletionStatus }[]): number | null {
  if (completions.length === 0) return null;
  const done = completions.filter((c) => c.status === "done").length;
  return done / completions.length;
}

/**
 * Série consécutive : nombre d'événements "done" d'affilée en partant du
 * pointage le plus récent (ordre chronologique d'occurrence).
 */
export function currentStreak(completions: CompletionLike[]): number {
  const sorted = [...completions].sort((a, b) => {
    const da = `${a.week_start}|${a.weekday}|${a.event_time}`;
    const db = `${b.week_start}|${b.weekday}|${b.event_time}`;
    return da < db ? -1 : da > db ? 1 : 0;
  });
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === "done") streak++;
    else break;
  }
  return streak;
}

/**
 * Meilleure série jamais réalisée : plus longue suite d'événements "done"
 * consécutifs sur tout l'historique (ordre chronologique d'occurrence).
 */
export function bestStreak(completions: CompletionLike[]): number {
  const sorted = [...completions].sort((a, b) => {
    const da = `${a.week_start}|${a.weekday}|${a.event_time}`;
    const db = `${b.week_start}|${b.weekday}|${b.event_time}`;
    return da < db ? -1 : da > db ? 1 : 0;
  });
  let best = 0;
  let run = 0;
  for (const c of sorted) {
    if (c.status === "done") {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Discipline d'une semaine donnée à partir de la semaine type actuelle et des
 * pointages de la semaine : done / nombre d'événements planifiés.
 * Retourne null si aucun événement n'est planifié.
 */
export function weekDiscipline(
  plannedEvents: Pick<PlannedEvent, "id">[],
  completions: Pick<EventCompletion, "status">[]
): number | null {
  if (plannedEvents.length === 0) return null;
  const done = completions.filter((c) => c.status === "done").length;
  return Math.min(1, done / plannedEvents.length);
}

export function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)} %`;
}
