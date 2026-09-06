import { WEEKDAY_LABELS } from "./constants";

/** Les sept jours, 1 = lundi … 7 = dimanche (format des `planned_events`). */
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Libellé court d'une liste de jours : « lundi et jeudi », « chaque jour ».
 *
 * Vit ici, et non dans `WeekdayPicker`, parce que les actions serveur
 * (notification d'affectation) l'appellent aussi : une fonction exportée d'un
 * module « use client » ne peut pas être invoquée côté serveur.
 */
export function weekdaysLabel(days: number[]): string {
  if (days.length === 7) return "chaque jour";
  const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d - 1].toLowerCase());
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}
