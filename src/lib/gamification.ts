import { addDays } from "./dates";
import type { MatchStat } from "./types";

// ---------------------------------------------------------------------------
// XP et niveaux — tout est dérivé des données existantes, rien n'est stocké.
// ---------------------------------------------------------------------------

export const XP_VALUES = {
  eventDone: 10, // événement du planning pointé "fait"
  habitCheck: 5, // jour d'habitude tenu
  sessionDone: 20, // séance assignée terminée
  match: 25, // match enregistré
} as const;

export interface XpState {
  xp: number;
  level: number;
  /** XP accumulés dans le niveau en cours */
  levelXp: number;
  /** XP nécessaires pour passer au niveau suivant */
  levelTarget: number;
}

/** Palier croissant : 100 XP pour le niveau 2, puis +50 par niveau. */
export function computeXp(counts: {
  eventsDone: number;
  habitChecks: number;
  sessionsDone: number;
  matches: number;
}): XpState {
  const xp =
    counts.eventsDone * XP_VALUES.eventDone +
    counts.habitChecks * XP_VALUES.habitCheck +
    counts.sessionsDone * XP_VALUES.sessionDone +
    counts.matches * XP_VALUES.match;

  let level = 1;
  let remaining = xp;
  let target = 100;
  while (remaining >= target) {
    remaining -= target;
    level += 1;
    target += 50;
  }
  return { xp, level, levelXp: remaining, levelTarget: target };
}

/** Titres de niveau : paliers croissants, du Rookie à la Légende. */
const LEVEL_TITLES: { min: number; title: string }[] = [
  { min: 25, title: "Légende" },
  { min: 17, title: "MVP" },
  { min: 12, title: "All-Star" },
  { min: 8, title: "Capitaine" },
  { min: 5, title: "Titulaire" },
  { min: 3, title: "Espoir" },
  { min: 1, title: "Rookie" },
];

export function levelTitle(level: number): string {
  return LEVEL_TITLES.find((t) => level >= t.min)?.title ?? "Rookie";
}

/** Prochain palier de titre à atteindre, null si déjà Légende. */
export function nextLevelTitle(level: number): { level: number; title: string } | null {
  const next = [...LEVEL_TITLES].reverse().find((t) => t.min > level);
  return next ? { level: next.min, title: next.title } : null;
}

// ---------------------------------------------------------------------------
// Tableau d'honneur — records personnels en match, tous dérivés de match_stats.
// ---------------------------------------------------------------------------

export type RecordKey = "points" | "twos" | "threes" | "rebounds" | "steals";

export interface RecordEntry {
  value: number;
  date: string; // match_date du record
}

export type MatchRecords = Record<RecordKey, RecordEntry | null>;

export const RECORD_LABELS: Record<RecordKey, string> = {
  points: "Points",
  twos: "Tirs à 2 pts",
  threes: "Tirs à 3 pts",
  rebounds: "Rebonds",
  steals: "Interceptions",
};

/** Paniers à 2 pts réussis, dérivés des tirs réussis moins les 3 pts. */
export function twosOf(m: {
  shots_made: number | null;
  threes_made: number | null;
}): number | null {
  if (m.shots_made == null || m.threes_made == null) return null;
  return Math.max(0, m.shots_made - m.threes_made);
}

export function computeMatchRecords(stats: MatchStat[]): MatchRecords {
  const best = (pick: (m: MatchStat) => number | null): RecordEntry | null => {
    let record: RecordEntry | null = null;
    for (const m of stats) {
      const value = pick(m);
      if (value == null) continue;
      if (record === null || value > record.value) record = { value, date: m.match_date };
    }
    return record;
  };
  return {
    points: best((m) => m.points),
    twos: best(twosOf),
    threes: best((m) => m.threes_made),
    rebounds: best((m) => m.rebounds),
    steals: best((m) => m.steals),
  };
}

// ---------------------------------------------------------------------------
// Badges — dérivés eux aussi ; la "découverte" (confetti) est gérée côté
// client via localStorage.
// ---------------------------------------------------------------------------

export type BadgeKey =
  | "premier-match"
  | "matchs-5"
  | "matchs-20"
  | "serie-7"
  | "serie-30"
  | "serie-100"
  | "record-battu"
  | "double-double"
  | "sniper"
  | "semaine-parfaite"
  | "semaines-5"
  | "seances-10"
  | "seances-50"
  | "checks-100"
  | "pointages-100"
  | "niveau-10";

export interface BadgeStatus {
  key: BadgeKey;
  label: string;
  description: string;
  earned: boolean;
  /** progression vers le badge (compteurs) ; null pour les badges tout-ou-rien */
  progress: { current: number; target: number } | null;
}

/** Plus longue suite de jours consécutifs dans un ensemble de dates. */
export function longestRun(dates: Iterable<string>): number {
  const set = new Set(dates);
  let best = 0;
  for (const date of set) {
    if (set.has(addDays(date, -1))) continue; // pas un début de série
    let len = 1;
    let cursor = addDays(date, 1);
    while (set.has(cursor)) {
      len++;
      cursor = addDays(cursor, 1);
    }
    if (len > best) best = len;
  }
  return best;
}

export interface BadgeInput {
  /** meilleure série (en jours) toutes habitudes confondues */
  bestHabitRun: number;
  matchCount: number;
  /** vrai si le record de points n'est pas le tout premier match */
  recordBeaten: boolean;
  /** nombre de semaines à 100 % du planning */
  perfectWeekCount: number;
  /** séances assignées terminées */
  sessionsDone: number;
  /** total de jours d'habitude cochés */
  habitChecks: number;
  /** événements du planning pointés « fait » */
  eventsDone: number;
  /** au moins un match à 10+ points et 10+ rebonds */
  hasDoubleDouble: boolean;
  /** meilleur nombre de 3 pts réussis sur un match */
  bestThreesInMatch: number;
  level: number;
}

/** Badge à compteur : earned dès que current atteint target, progression visible. */
function counted(
  key: BadgeKey,
  label: string,
  description: string,
  current: number,
  target: number
): BadgeStatus {
  return {
    key,
    label,
    description,
    earned: current >= target,
    progress: { current: Math.min(current, target), target },
  };
}

export function computeBadges(input: BadgeInput): BadgeStatus[] {
  return [
    counted("premier-match", "Premier match", "Ton premier match enregistré dans l'app.", input.matchCount, 1),
    counted("matchs-5", "5 matchs", "5 matchs enregistrés : la saison est lancée.", input.matchCount, 5),
    counted("matchs-20", "20 matchs", "20 matchs au compteur — un vrai compétiteur.", input.matchCount, 20),
    counted("serie-7", "Série de 7", "7 jours d'affilée sur une habitude.", input.bestHabitRun, 7),
    counted("serie-30", "Série de 30", "30 jours d'affilée — régularité de pro.", input.bestHabitRun, 30),
    counted("serie-100", "Série de 100", "100 jours d'affilée. Niveau NBA.", input.bestHabitRun, 100),
    {
      key: "record-battu",
      label: "Record battu",
      description: "Nouveau record de points en match.",
      earned: input.recordBeaten,
      progress: null,
    },
    {
      key: "double-double",
      label: "Double-double",
      description: "10+ points et 10+ rebonds sur un même match.",
      earned: input.hasDoubleDouble,
      progress: null,
    },
    counted("sniper", "Sniper", "5 tirs à 3 pts réussis sur un match.", input.bestThreesInMatch, 5),
    counted(
      "semaine-parfaite",
      "Semaine parfaite",
      "100 % du planning réalisé sur une semaine.",
      input.perfectWeekCount,
      1
    ),
    counted(
      "semaines-5",
      "5 semaines parfaites",
      "5 semaines à 100 % — une machine.",
      input.perfectWeekCount,
      5
    ),
    counted("seances-10", "10 séances", "10 séances du coach terminées.", input.sessionsDone, 10),
    counted("seances-50", "50 séances", "50 séances terminées — le travail paie.", input.sessionsDone, 50),
    counted("checks-100", "100 habitudes", "100 jours d'habitudes cochés au total.", input.habitChecks, 100),
    counted(
      "pointages-100",
      "100 pointages",
      "100 événements du planning validés.",
      input.eventsDone,
      100
    ),
    counted("niveau-10", "Niveau 10", "Atteins le niveau 10 en accumulant l'XP.", input.level, 10),
  ];
}
