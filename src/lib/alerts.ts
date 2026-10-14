import type { SupabaseClient } from "@supabase/supabase-js";
import { LOW_DISCIPLINE_THRESHOLD } from "./constants";
import { formatPercent } from "./discipline";
import type { HealthEntry, PlayerDiscipline } from "./coach-data";
import type { SessionPole } from "./types";

/**
 * Le récap « À savoir » de l'accueil staff : pour chaque joueur, tout ce qui
 * demande une action, cumulé sur UNE ligne. Un joueur pour qui tout va bien
 * n'apparaît pas — c'est ce qui rend la liste courte quand la saison roule.
 *
 * Deux niveaux : `danger` = à traiter maintenant (message, douleur, rien de
 * visible côté joueur) ; `warning` = à corriger cette semaine (planning,
 * discipline, séance manquante, silence, bilan). Les alertes sont calculées
 * ici, jamais dans la page : l'accueil affiche, il ne décide pas.
 */
export type AlertSeverity = "danger" | "warning";

export type AlertKey =
  | "message"
  | "review-reply"
  | "pain"
  | "hidden-sessions"
  | "planning-empty"
  | "no-basket"
  | "no-physique"
  | "discipline"
  | "silence"
  | "review-missing";

export interface PlayerAlert {
  key: AlertKey;
  severity: AlertSeverity;
  label: string;
  /** onglet de la fiche à ouvrir pour agir */
  tab: "messages" | "semaine" | "programme" | "fiche";
  /**
   * Référence de l'occurrence : ce qui distingue « ce message-ci » du
   * précédent (date du dernier message, du check-in, semaine concernée…).
   * Sert à ne pas confondre deux alertes successives de même nature.
   */
  ref: string;
}

export interface PlayerAlertRow {
  player: PlayerDiscipline;
  alerts: PlayerAlert[];
  /** vrai dès qu'une alerte est `danger` */
  critical: boolean;
}

/** Séances affectées à un joueur : par pôle, et celles sans jour (invisibles). */
export interface SessionCoverage {
  byPole: Record<SessionPole, number>;
  /** affectations sans `weekday` : le joueur ne les voit pas (0035) */
  hidden: number;
}

/** Sans échange depuis autant de jours, on considère le fil éteint. */
export const SILENCE_DAYS = 30;
/** Douleur à partir de laquelle on alerte, sur un check-in récent. */
export const PAIN_ALERT_SCORE = 5;
export const PAIN_ALERT_DAYS = 7;

export async function getSessionCoverage(
  supabase: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, SessionCoverage>> {
  const coverage = new Map<string, SessionCoverage>();
  if (playerIds.length === 0) return coverage;

  const { data } = await supabase
    .from("session_assignments")
    .select("player_id, weekday, session:library_sessions!inner(pole)")
    .in("player_id", playerIds)
    .is("removed_at", null);

  for (const id of playerIds) {
    coverage.set(id, { byPole: { basket: 0, physique: 0, routine: 0 }, hidden: 0 });
  }
  for (const a of data ?? []) {
    const entry = coverage.get(a.player_id);
    if (!entry) continue;
    const session = Array.isArray(a.session) ? a.session[0] : a.session;
    const pole = session?.pole as SessionPole | undefined;
    if (pole) entry.byPole[pole] += 1;
    if (a.weekday === null) entry.hidden += 1;
  }
  return coverage;
}

export interface AlertInput {
  player: PlayerDiscipline;
  hasUnread: boolean;
  /** date ISO du message qui attend (référence de l'alerte « message ») */
  unreadAt?: string | null;
  /** un bilan reçu attend la réponse du coach : son id, sinon null */
  pendingReviewId?: string | null;
  health: HealthEntry | null;
  coverage: SessionCoverage | null;
  /** date ISO du dernier message du joueur, tous canaux confondus */
  lastMessageAt: string | null;
  /** le bilan de la semaine passée est arrivé */
  hasLastWeekReview: boolean;
  /** lundi de la semaine en cours (référence des alertes de la semaine) */
  weekStart?: string;
  /** « maintenant » en ISO (heure de Paris) */
  nowIso: string;
}

function daysSince(iso: string, nowIso: string): number {
  return (new Date(nowIso).getTime() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Les alertes d'un joueur, dans l'ordre où on les lit : les rouges d'abord.
 *
 * Un joueur blessé ou en vacances ne remonte que les messages et la douleur :
 * son absence est connue, lui reprocher un planning vide n'aurait pas de sens.
 */
export function buildPlayerAlerts(input: AlertInput): PlayerAlert[] {
  const { player, health, coverage } = input;
  const alerts: PlayerAlert[] = [];
  const isAway = player.availability !== "available";
  // les alertes « de la semaine » se référencent au lundi : une prise en
  // charge vaut pour la semaine, pas pour toujours
  const week = input.weekStart ?? input.nowIso.slice(0, 10);

  if (input.hasUnread) {
    alerts.push({
      key: "message",
      severity: "danger",
      label: "Message en attente",
      tab: "messages",
      ref: input.unreadAt ?? week,
    });
  }

  if (input.pendingReviewId) {
    alerts.push({
      key: "review-reply",
      severity: "danger",
      label: "Bilan à répondre",
      tab: "semaine",
      ref: input.pendingReviewId,
    });
  }

  const pain = health?.pain;
  if (pain && pain.score >= PAIN_ALERT_SCORE && daysSince(pain.at, input.nowIso) <= PAIN_ALERT_DAYS) {
    alerts.push({
      key: "pain",
      severity: "danger",
      label: `Douleur ${pain.score}/10`,
      tab: "fiche",
      ref: pain.at,
    });
  }

  if (isAway) return alerts;

  if (coverage && coverage.hidden > 0) {
    alerts.push({
      key: "hidden-sessions",
      severity: "danger",
      label: `${coverage.hidden} séance${coverage.hidden > 1 ? "s" : ""} sans jour`,
      tab: "programme",
      ref: week,
    });
  }

  if (player.planningEmpty) {
    alerts.push({
      key: "planning-empty",
      severity: "warning",
      label: "Planning vide",
      tab: "semaine",
      ref: week,
    });
  }

  if (coverage && coverage.byPole.basket === 0) {
    alerts.push({
      key: "no-basket",
      severity: "warning",
      label: "Aucune séance technique",
      tab: "programme",
      ref: week,
    });
  }
  if (coverage && coverage.byPole.physique === 0) {
    alerts.push({
      key: "no-physique",
      severity: "warning",
      label: "Aucune séance physique",
      tab: "programme",
      ref: week,
    });
  }

  if (player.discipline !== null && player.discipline < LOW_DISCIPLINE_THRESHOLD) {
    alerts.push({
      key: "discipline",
      severity: "warning",
      label: `Discipline ${formatPercent(player.discipline)}`,
      tab: "semaine",
      ref: week,
    });
  }

  // silence : pas un mot depuis 30 jours — ou jamais, pour un joueur qui n'est
  // plus tout neuf (un compte créé hier n'a évidemment rien écrit)
  const sinceRef = input.lastMessageAt ?? player.created_at;
  if (daysSince(sinceRef, input.nowIso) >= SILENCE_DAYS) {
    alerts.push({
      key: "silence",
      severity: "warning",
      label: input.lastMessageAt
        ? `Silence ${Math.floor(daysSince(input.lastMessageAt, input.nowIso))} j`
        : "Aucun échange",
      tab: "messages",
      ref: week,
    });
  }

  if (!input.hasLastWeekReview && daysSince(player.created_at, input.nowIso) >= 7) {
    alerts.push({
      key: "review-missing",
      severity: "warning",
      label: "Bilan manquant",
      tab: "semaine",
      ref: week,
    });
  }

  return alerts;
}

/**
 * Les lignes du récap : seuls les joueurs qui ont au moins une alerte, les
 * critiques en tête, puis ceux qui en cumulent le plus, puis A → Z.
 */
export function rankAlertRows(rows: PlayerAlertRow[]): PlayerAlertRow[] {
  return rows
    .filter((r) => r.alerts.length > 0)
    .sort((a, b) => {
      if (a.critical !== b.critical) return a.critical ? -1 : 1;
      const ad = a.alerts.filter((x) => x.severity === "danger").length;
      const bd = b.alerts.filter((x) => x.severity === "danger").length;
      if (ad !== bd) return bd - ad;
      if (a.alerts.length !== b.alerts.length) return b.alerts.length - a.alerts.length;
      return a.player.first_name.localeCompare(b.player.first_name, "fr");
    });
}
