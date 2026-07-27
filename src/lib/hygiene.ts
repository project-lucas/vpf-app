// Hygiène de vie : critères notés, moyennes de l'historique.
// Aucune de ces valeurs n'est stockée en base — tout est recalculé depuis les
// saisies quotidiennes (même principe que la gamification).
//
// Le sommeil n'est PAS noté : il reste une durée (« 7h20 de moyenne »), affichée
// telle quelle. Seuls les quatre critères d'hygiène alimentaire ont un radar.

import type { HygieneCriterion, HygieneLog } from "@/lib/types";

/** Note maximale d'un critère. */
export const HYGIENE_MAX = 5;

/**
 * Ouverture de la mission quotidienne (elle compte dans le % de la journée).
 * Les jours ANTÉRIEURS ne la comptent pas : sans cette borne, la mise en
 * ligne ferait retomber d'un coup les journées déjà passées de la semaine,
 * pour une mission qui n'existait pas encore. Même principe que le
 * `created_at` d'un événement ajouté en cours de semaine.
 */
export const HYGIENE_MISSION_START = "2026-07-27";

/** true si la mission d'hygiène est due ce jour-là (et compte dans le %). */
export function isMissionDay(date: string): boolean {
  return date >= HYGIENE_MISSION_START;
}

/** Bornes de saisie du sommeil (les raccourcis ± ajustent par pas de 30 min). */
export const SLEEP_MIN_HOURS = 3;
export const SLEEP_MAX_HOURS = 13;

export const HYGIENE_CRITERIA: { key: HygieneCriterion; label: string; hint: string }[] = [
  {
    key: "hydration",
    label: "Hydratation",
    hint: "1 = presque rien bu · 5 = 2 L et plus, régulièrement",
  },
  {
    key: "carbs",
    label: "Glucides",
    hint: "1 = aucun apport · 5 = féculents à chaque repas, avant/après effort",
  },
  {
    key: "proteins",
    label: "Protéines",
    hint: "1 = aucun apport · 5 = une source de protéines à chaque repas",
  },
  {
    key: "vitamins",
    label: "Vitamines",
    hint: "1 = ni fruit ni légume · 5 = fruits et légumes à volonté",
  },
];

/** « 7h30 », « 8h » — le format court utilisé partout dans l'écran. */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export interface HygieneAverages {
  /** nombre de jours saisis sur la période retenue */
  days: number;
  /** moyenne d'heures de sommeil — affichée en durée, jamais convertie en note */
  sleepHours: number;
  /** moyennes sur 5 des quatre critères du radar */
  scores: Record<HygieneCriterion, number>;
}

/**
 * Moyennes de l'historique. `logs` peut être vide : days vaut alors 0 et
 * l'écran affiche l'état vide plutôt qu'un radar plat.
 */
export function computeHygieneAverages(logs: HygieneLog[]): HygieneAverages {
  const days = logs.length;
  if (days === 0) {
    return {
      days: 0,
      sleepHours: 0,
      scores: { hydration: 0, carbs: 0, proteins: 0, vitamins: 0 },
    };
  }

  const sum = (pick: (log: HygieneLog) => number) =>
    logs.reduce((total, log) => total + pick(log), 0) / days;

  return {
    days,
    sleepHours: sum((l) => Number(l.sleep_hours)),
    scores: {
      hydration: sum((l) => l.hydration),
      carbs: sum((l) => l.carbs),
      proteins: sum((l) => l.proteins),
      vitamins: sum((l) => l.vitamins),
    },
  };
}
