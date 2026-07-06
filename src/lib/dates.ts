// Helpers de dates — tout est calculé dans le fuseau Europe/Paris,
// quel que soit le fuseau du serveur (Vercel = UTC).

const PARIS_TZ = "Europe/Paris";

export interface ParisNow {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  isoWeekday: number; // 1 = lundi ... 7 = dimanche
  minutesOfDay: number;
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function parisNow(at: Date = new Date()): ParisNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${hour}:${get("minute")}`;
  return {
    date,
    time,
    isoWeekday: WEEKDAY_TO_ISO[get("weekday")] ?? 1,
    minutesOfDay: parseInt(hour, 10) * 60 + parseInt(get("minute"), 10),
  };
}

/** Ajoute n jours à une date "YYYY-MM-DD" (arithmétique pure, sans fuseau). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Jour ISO (1-7) d'une date "YYYY-MM-DD". */
export function isoWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return dow === 0 ? 7 : dow;
}

/** Lundi de la semaine contenant la date donnée. */
export function weekStartOf(dateStr: string): string {
  return addDays(dateStr, 1 - isoWeekdayOf(dateStr));
}

/** Lundi de la semaine courante à Paris. */
export function currentWeekStart(at: Date = new Date()): string {
  const now = parisNow(at);
  return addDays(now.date, 1 - now.isoWeekday);
}

/** "HH:MM:SS" ou "HH:MM" -> "HH:MM" */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** "HH:MM[:SS]" -> minutes depuis minuit */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Date "YYYY-MM-DD" -> "12 mars 2026" */
export function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Numéro de semaine ISO-8601 (1-53) d'une date "YYYY-MM-DD". */
export function isoWeekNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7; // 0 = lundi
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((dt.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** Semaine "du 12 au 18 mars" à partir du lundi. */
export function formatWeekFr(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [, , d1] = weekStart.split("-").map(Number);
  return `du ${d1} au ${formatDateFr(end)}`;
}

export function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const today = parisNow().date;
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Nombre de jours entre deux dates "YYYY-MM-DD" (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Numéro du jour de saison (croissant, sans limite) : jours écoulés depuis la
 * dernière occurrence du début de saison (mois/jour), en comptant à partir de 1.
 */
export function seasonDayNumber(
  todayStr: string,
  start: { month: number; day: number }
): number {
  const [year, month, day] = todayStr.split("-").map(Number);
  const startYear =
    month > start.month || (month === start.month && day >= start.day) ? year : year - 1;
  const mm = String(start.month).padStart(2, "0");
  const dd = String(start.day).padStart(2, "0");
  return daysBetween(`${startYear}-${mm}-${dd}`, todayStr) + 1;
}
