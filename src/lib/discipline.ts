import { addDays } from "./dates";
import type { CompletionStatus, EventCompletion, PlannedEvent } from "./types";

interface CompletionLike {
  status: CompletionStatus;
  week_start: string;
  weekday: number;
  event_time: string;
}

/**
 * Série de JOURS COMPLETS consécutifs : un jour compte quand tous ses
 * pointages sont "done". Un jour avec un événement raté casse la chaîne ;
 * un jour sans aucun pointage (repos) ne la casse pas et ne compte pas.
 * La journée en cours compte si elle est déjà bouclée, sinon elle est neutre.
 */
export function completedDayStreak(
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
  if (todayEntry && todayEntry.total > 0 && todayEntry.done === todayEntry.total) streak++;

  let cursor = addDays(today, -1);
  while (cursor >= earliest) {
    const entry = byDate.get(cursor);
    if (entry) {
      if (entry.total > 0 && entry.done === entry.total) streak++;
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
