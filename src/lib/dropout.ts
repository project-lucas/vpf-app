/**
 * Le décrochage se voit avant le seuil : les alertes de `alerts.ts` réagissent
 * à un état (discipline < 60 %, silence de 30 j) ; ici on lit des PENTES sur
 * plusieurs semaines. Un signal seul ne dit rien ; dès deux signaux, le
 * décrochage est « en cours » et on conseille une visio — repéré trois
 * semaines plus tôt, un joueur se rattrape encore.
 *
 * Rien n'est stocké : tout se recalcule depuis l'historique (pointages,
 * bilans, check-ins énergie, échanges).
 */

/** Deux signaux concordants suffisent à parler de décrochage. */
export const DROPOUT_MIN_SIGNALS = 2;
/** Un compte plus jeune n'a pas assez d'historique pour une pente. */
const MIN_ACCOUNT_DAYS = 21;
/** Discipline : au moins 20 points perdus sur trois semaines qui baissent. */
const DISCIPLINE_DROP = 0.2;
/** Énergie : les deux derniers check-ins 2 points sous les précédents. */
const ENERGY_DROP = 2;
/** Bilans : le dernier fait moins de 60 % du plus ancien, et moins de 120 signes. */
const REVIEW_SHRINK_RATIO = 0.6;
const REVIEW_SHORT_CHARS = 120;
/** Échanges : plus rien depuis deux semaines. */
const QUIET_DAYS = 14;

export interface DropoutInput {
  availability: string;
  createdAt: string;
  nowIso: string;
  /** semaines clôturées, la plus récente d'abord */
  weeks: { weekStart: string; done: number; planned: number; reviewChars: number | null }[];
  /** scores d'énergie des 4 dernières semaines, le plus récent d'abord */
  energies: number[];
  lastExchangeAt: string | null;
}

export interface DropoutRisk {
  /** les signaux, en mots : « discipline 80 → 50 → 30 % » */
  reasons: string[];
}

const days = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
const pct = (x: number) => `${Math.round(x * 100)} %`;

export function detectDropout(input: DropoutInput): DropoutRisk | null {
  if (input.availability !== "available") return null;
  if (days(input.createdAt, input.nowIso) < MIN_ACCOUNT_DAYS) return null;
  const reasons: string[] = [];

  // 1. discipline qui baisse trois semaines de suite
  const rates = input.weeks
    .slice(0, 3)
    .map((w) => (w.planned > 0 ? Math.min(1, w.done / w.planned) : null));
  if (rates.length === 3 && rates.every((r): r is number => r !== null)) {
    const [last, mid, first] = rates as number[];
    if (first > mid && mid > last && first - last >= DISCIPLINE_DROP) {
      reasons.push(`discipline en baisse 3 semaines de suite (${pct(first)} → ${pct(mid)} → ${pct(last)})`);
    }
  }

  // 2. énergie qui glisse
  if (input.energies.length >= 3) {
    const recent = input.energies.slice(0, 2);
    const before = input.energies.slice(2);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    if (avg(before) - avg(recent) >= ENERGY_DROP) {
      reasons.push(`énergie qui glisse (${Math.round(avg(before))} → ${Math.round(avg(recent))}/10)`);
    }
  }

  // 3. bilans de plus en plus courts, ou qui manquent
  const lengths = input.weeks.slice(0, 3).map((w) => w.reviewChars);
  if (lengths.length === 3 && lengths.every((l): l is number => l !== null)) {
    const [last, mid, first] = lengths as number[];
    if (first > mid && mid > last && last < first * REVIEW_SHRINK_RATIO && last < REVIEW_SHORT_CHARS) {
      reasons.push("bilans de plus en plus courts");
    }
  }
  const missing = lengths.filter((l) => l === null).length;
  if (lengths.length === 3 && missing >= 2) {
    reasons.push(`${missing} bilans manqués sur les 3 dernières semaines`);
  }

  // 4. plus d'échange depuis deux semaines
  const quietRef = input.lastExchangeAt ?? input.createdAt;
  const quiet = Math.floor(days(quietRef, input.nowIso));
  if (quiet >= QUIET_DAYS) {
    reasons.push(input.lastExchangeAt ? `aucun échange depuis ${quiet} jours` : "aucun échange depuis son arrivée");
  }

  return reasons.length >= DROPOUT_MIN_SIGNALS ? { reasons } : null;
}
