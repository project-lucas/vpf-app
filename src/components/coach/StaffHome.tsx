"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Pencil, Send, Sparkles, X } from "lucide-react";
import { sendConversationMessage } from "@/app/actions/messages";
import { StatStrip } from "@/components/ui/StatStrip";
import { JarvisAvatar } from "@/components/coach/JarvisAvatar";
import { PlayerAvatar } from "@/components/coach/PlayerAvatar";
import { JarvisChat } from "@/components/coach/JarvisChat";
import {
  CallLinks,
  KickoffBox,
  OfferMark,
  ReviewCell,
  ScoreCell,
  Sparkline,
  WeekHistoryCell,
} from "@/components/coach/HomeCells";
import { MESSAGE_MAX_LENGTH, channelKey } from "@/lib/constants";
import { formatPercent } from "@/lib/discipline";
import { formatAgoFr } from "@/lib/dates";
import type { ThreadLine } from "@/lib/recent-thread";
import { HISTORY_WEEK_CHOICES, type HomeRow } from "@/lib/staff-overview";
import type { BriefAction, BriefRecommendation } from "@/lib/briefs";

export interface HomeGroup {
  id: string;
  name: string;
  staffNames: string;
  isMine: boolean;
}

export interface HomeBrief {
  summary: string;
  recommendations: BriefRecommendation[];
  createdAt: string;
}

export interface HomeJournalEntry {
  id: string;
  actorName: string;
  actorKind: string;
  summary: string;
  at: string;
}

/** Identifiant du groupe fantôme des joueurs sans groupe. */
export const NO_GROUP_ID = "none";

type Scope = "todo" | "all";
type OfferFilter = "all" | "perf" | "formation";

interface RecoView {
  key: string;
  playerId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  offer: HomeRow["offer"] | null;
  title: string;
  why: string;
  message: string | null;
  action: BriefAction;
  ficheHref: string | null;
  /** les derniers messages du fil Global, du plus ancien au plus récent */
  history?: ThreadLine[];
}

// ---------------------------------------------------------------------------
// Petites briques
// ---------------------------------------------------------------------------

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-navy-400">{label}</span>
      <div className="inline-flex rounded-xl bg-cream p-1">{children}</div>
    </div>
  );
}

function Segment({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
        on ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-900"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n, on }: { n: number; on: boolean }) {
  return (
    <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${on ? "bg-accent text-white" : "bg-sand text-navy-500"}`}>
      {n}
    </span>
  );
}

/** Récent = dans les 7 derniers jours. */
const HEALTH_RECENT_MS = 7 * 86_400_000;

/**
 * L'état de santé d'un joueur, en un mot : blessé, douleur, gêne, vacances,
 * ou OK. Sources : la disponibilité posée par le staff, le dernier check-in
 * douleur (7 jours) et la question santé du dernier bilan.
 */
function HealthCell({ row }: { row: HomeRow }) {
  const recentPain =
    row.pain && Date.now() - new Date(row.pain.at).getTime() <= HEALTH_RECENT_MS ? row.pain.score : null;
  if (row.availability === "injured") return <Tag tone="red">Blessé</Tag>;
  if (row.availability === "vacation") return <Tag tone="grey">Vacances</Tag>;
  if (recentPain !== null && recentPain >= 5) return <Tag tone="red">Douleur</Tag>;
  if (row.reviewHealth === "blessure") return <Tag tone="red">Blessure signalée</Tag>;
  if ((recentPain !== null && recentPain >= 3) || row.reviewHealth === "gene") {
    return <Tag tone="amber">Gêne</Tag>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      OK
    </span>
  );
}

/**
 * La dernière note de douleur, seule dans sa colonne : la note et son âge.
 * En couleur si elle est récente (7 j), en gris sinon — une vieille note ne
 * dit plus rien de l'état du jour.
 */
function PainCell({ pain }: { pain: HomeRow["pain"] }) {
  if (!pain) return <span className="text-xs text-navy-300">—</span>;
  const recent = Date.now() - new Date(pain.at).getTime() <= HEALTH_RECENT_MS;
  const tone = !recent
    ? "text-navy-300"
    : pain.score >= 5
      ? "text-danger"
      : pain.score >= 3
        ? "text-warning"
        : "text-navy-900";
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={`text-[13px] font-bold tabular-nums ${tone}`}>{pain.score}/10</span>
      <span className="text-[11px] text-navy-300">{formatAgoFr(pain.at)}</span>
    </span>
  );
}

function Tag({ tone, children }: { tone: "red" | "amber" | "grey" | "navy" | "line"; children: React.ReactNode }) {
  const look = {
    red: "bg-danger-soft text-danger",
    amber: "bg-warning-soft text-warning",
    grey: "bg-navy-50 text-navy-500",
    navy: "bg-navy-800 text-white",
    line: "ring-1 ring-inset ring-navy-200 text-navy-500",
  }[tone];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold ${look}`}>
      {children}
    </span>
  );
}

function DisciplineBar({ value, frozen }: { value: number | null; frozen: boolean }) {
  if (frozen) return <span className="text-xs text-navy-300">gelée</span>;
  if (value === null) return <span className="text-xs text-navy-300">—</span>;
  const pct = Math.round(value * 100);
  const color = pct < 60 ? "text-danger" : pct < 80 ? "text-warning" : "text-navy-900";
  return <span className={`inline-block w-11 text-[13px] font-bold tabular-nums ${color}`}>{pct} %</span>;
}

/** L'action principale d'une ligne : la première alerte dit où aller. */
function primaryAction(row: HomeRow): { label: string; href: string; tone: "danger" | "primary" | "ghost" } | null {
  const a = row.alerts[0];
  if (!a) return null;
  const fiche = `/coach/joueurs/${row.id}`;
  switch (a.key) {
    case "message":
      return { label: "Répondre", href: `${fiche}?onglet=messages&canal=${channelKey(row.unreadChannel)}`, tone: "danger" };
    case "review-reply":
      return { label: "Lire le bilan", href: `${fiche}?onglet=semaine`, tone: "primary" };
    case "pain":
      return { label: "Prendre des nouvelles", href: `${fiche}?onglet=messages`, tone: "primary" };
    case "hidden-sessions":
    case "no-basket":
    case "no-physique":
      return { label: "Programme", href: `${fiche}?onglet=programme`, tone: "ghost" };
    case "planning-empty":
      return { label: "Planning", href: `${fiche}?onglet=semaine`, tone: "ghost" };
    case "dropout":
      return { label: "Proposer une visio", href: "/coach/aujourdhui#decrochage", tone: "primary" };
    default:
      return { label: "Écrire", href: `${fiche}?onglet=messages`, tone: "ghost" };
  }
}

/**
 * Le rendez-vous des rapports aux parents (le 28 de chaque mois) : un compte à
 * rebours en jours, qui ouvre la section Rapports de l'onglet Jarvis. Il passe
 * à l'orange quand l'envoi approche ou que des rapports attendent.
 */
function ReportCountdown({ due }: { due: { days: number; dateLabel: string; pending: number } }) {
  const urgent = due.pending > 0 || due.days <= 2;
  const badge = due.days === 0 ? "J" : `J-${due.days}`;
  const main =
    due.pending > 0
      ? `${due.pending} rapport${due.pending > 1 ? "s" : ""} à envoyer`
      : due.days === 0
        ? "C'est aujourd'hui"
        : `Dans ${due.days} jour${due.days > 1 ? "s" : ""}`;
  return (
    <Link
      href="/coach/aujourdhui?section=rapports"
      className="group inline-flex min-h-11 items-center gap-3 rounded-2xl border border-sand bg-white py-2 pl-2 pr-3.5 text-navy-900 shadow-[0_8px_20px_-14px_rgba(15,42,74,0.4)] transition-shadow hover:shadow-[0_12px_26px_-14px_rgba(15,42,74,0.55)]"
    >
      <span
        className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-1.5 font-display text-[15px] font-extrabold tabular-nums text-white ${
          urgent ? "bg-accent" : "bg-navy-800"
        }`}
      >
        {badge}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-accent">
          Rapports parents · {due.dateLabel}
        </span>
        <span className="text-[13px] font-extrabold">{main}</span>
      </span>
      <ChevronRight size={16} strokeWidth={2.4} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function ActionLink({ action }: { action: ReturnType<typeof primaryAction> }) {
  if (!action) return <span className="text-xs text-navy-300">à jour</span>;
  const look = {
    danger: "bg-accent text-white hover:opacity-90",
    primary: "bg-navy-800 text-white hover:bg-navy-700",
    ghost: "bg-navy-50 text-navy-700 hover:bg-navy-100",
  }[action.tone];
  return (
    <Link
      href={action.href}
      className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors ${look}`}
    >
      {action.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Une recommandation dans le volet Jarvis
// ---------------------------------------------------------------------------

/**
 * Les derniers échanges du fil, au-dessus de la suggestion : on relit ce que
 * le joueur a dit (et ce qu'on lui a répondu) avant d'envoyer. Les messages du
 * joueur ou d'un parent sont à gauche sur fond crème, ceux du staff à droite.
 */
function ThreadPreview({ lines, firstName }: { lines: ThreadLine[]; firstName: string }) {
  const label = { player: firstName || "Joueur", parent: "Parent", staff: "Staff", system: "VPF" };
  return (
    <div className="mt-2.5">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-navy-400">Derniers échanges</p>
      {lines.length === 0 ? (
        <p className="text-[12px] text-navy-400">Aucun message dans le fil Global.</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((l) => {
            const family = l.from === "player" || l.from === "parent";
            return (
              <li key={`${l.at}-${l.from}`} className={`flex ${family ? "justify-start" : "justify-end"}`}>
                <span
                  className={`max-w-[88%] rounded-xl px-2.5 py-1.5 text-[12.5px] leading-snug ${
                    family ? "bg-cream text-navy-900" : "bg-white text-navy-600 ring-1 ring-navy-100"
                  }`}
                >
                  <span className="mr-1.5 text-[10.5px] font-bold text-navy-400">
                    {label[l.from]} · {formatAgoFr(l.at)}
                  </span>
                  <span className="line-clamp-3">{l.body}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mb-1 mt-2.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-accent">Suggestion de Jarvis</p>
    </div>
  );
}

function RecoCard({ reco }: { reco: RecoView }) {
  const [draft, setDraft] = useState(reco.message ?? "");
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function send() {
    if (!reco.playerId) return;
    setError(null);
    startTransition(async () => {
      const result = await sendConversationMessage(reco.playerId!, draft, null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      setEditing(false);
    });
  }

  return (
    <article className="rounded-2xl border border-navy-100 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        {reco.playerId ? (
          <PlayerAvatar firstName={reco.firstName} lastName={reco.lastName} size="sm" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-white">
            <Sparkles size={14} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-navy-900">
            {reco.playerId ? reco.name : "Le groupe"}
          </span>
          <span className="block truncate text-[12px] text-navy-500">{reco.title}</span>
        </span>
        {reco.offer && <OfferMark offer={reco.offer} />}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-navy-500">{reco.why}</p>

      {reco.playerId && reco.message !== null && !sent && (
        <ThreadPreview lines={reco.history ?? []} firstName={reco.firstName} />
      )}

      {reco.message !== null && !sent && (
        <div className="mt-2">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-[13px] text-navy-900 focus:border-navy-600 focus:outline-none"
            />
          ) : (
            <p className="rounded-xl bg-navy-50 px-3 py-2 text-[13px] leading-snug text-navy-900">{draft}</p>
          )}
          <p className="mt-1 text-[10.5px] text-navy-300">Fil Global · lu aussi par les parents</p>
        </div>
      )}
      {error && <p className="mt-1.5 text-[11px] font-semibold text-danger">{error}</p>}

      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
        {reco.ficheHref && (
          <Link
            href={reco.ficheHref}
            className={`inline-flex min-h-8 items-center gap-0.5 text-[11.5px] font-semibold ${
              reco.message === null && reco.action === "message"
                ? "rounded-full bg-danger px-3 py-1 text-white hover:opacity-90"
                : "mr-auto text-navy-500 hover:text-navy-800"
            }`}
          >
            {reco.action === "assign_session"
              ? "Ouvrir le programme"
              : reco.message === null && reco.action === "message"
                ? "Ouvrir le fil"
                : "Voir la fiche"}
            <ChevronRight size={13} />
          </Link>
        )}
        {reco.message !== null && !sent && (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              disabled={isPending}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-navy-50 px-3 py-1 text-[11.5px] font-bold text-navy-700 hover:bg-navy-100"
            >
              <Pencil size={11} />
              {editing ? "Aperçu" : "Modifier"}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={isPending || !draft.trim()}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-navy-800 px-3 py-1 text-[11.5px] font-bold text-white hover:bg-navy-700 disabled:opacity-60"
            >
              <Send size={11} />
              {isPending ? "Envoi…" : "Envoyer"}
            </button>
          </>
        )}
        {sent && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success">
            <Check size={13} /> Envoyé
          </span>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// L'accueil
// ---------------------------------------------------------------------------

/**
 * L'accueil du staff en vue tableau : un groupe à la fois, tous ses joueurs
 * en lignes, une colonne par signal, l'action à droite. Le volet « Jarvis »
 * se pose par-dessus (bouton en tête) : le mot du matin, les recommandations
 * avec leurs messages prêts à envoyer, et le journal du jour. Sans brief du
 * matin (clé API absente, ou pas encore 7h), le volet montre les messages à
 * trous de la couche 1.
 */
export function StaffHome({
  groups,
  rows,
  briefs,
  journalToday,
  briefConfigured,
  isAdmin,
  todayLabel,
  initialGroupId,
  weeks,
  viewerFirstName,
  initialPanelOpen = false,
  initialHistoryOpen = false,
  recentThreads = {},
  reportDue,
}: {
  groups: HomeGroup[];
  rows: HomeRow[];
  briefs: Record<string, HomeBrief>;
  journalToday: HomeJournalEntry[];
  briefConfigured: boolean;
  isAdmin: boolean;
  todayLabel: string;
  initialGroupId: string;
  /** semaines d'historique chargées */
  weeks: number;
  /** prénom du lecteur, pour « Bonjour Lucas » */
  viewerFirstName: string;
  /** volet Jarvis ouvert à l'arrivée (lien de la barre latérale) */
  initialPanelOpen?: boolean;
  /** l'historique s'ouvre d'entrée quand une durée est demandée dans l'URL */
  initialHistoryOpen?: boolean;
  /** derniers messages du fil Global des joueurs cités par le brief */
  recentThreads?: Record<string, ThreadLine[]>;
  /** prochain envoi des rapports aux parents (le 28) et rapports prêts */
  reportDue: { days: number; dateLabel: string; pending: number };
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [groupId, setGroupId] = useState(initialGroupId);
  const [scope, setScope] = useState<Scope>("todo");
  const [offer, setOffer] = useState<OfferFilter>("all");
  const [panelOpen, setPanelOpen] = useState(initialPanelOpen);
  const [showHistory, setShowHistory] = useState(initialHistoryOpen);
  const scrollTable = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: "smooth" });

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanelOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const groupRows = useMemo(
    () => rows.filter((r) => (r.groupId ?? NO_GROUP_ID) === (group?.id ?? NO_GROUP_ID)),
    [rows, group]
  );
  const todoRows = groupRows.filter((r) => r.alerts.length > 0);
  // la visio de départ ne concerne que les joueurs arrivés après la règle
  const showKickoff = groupRows.some((r) => r.kickoffExpected);
  const visible = (scope === "todo" ? todoRows : groupRows).filter(
    (r) => offer === "all" || r.offer === offer
  );

  // ---- les chiffres du groupe
  const unreadCount = groupRows.filter((r) => r.unread).length;
  const toReply = groupRows.filter((r) => r.review === "to-reply").length;
  const expected = groupRows.filter((r) => r.availability === "available");
  const received = expected.filter((r) => r.review === "to-reply" || r.review === "replied").length;
  const scored = expected.filter((r) => r.discipline !== null);
  const avg = scored.length ? scored.reduce((s, r) => s + (r.discipline ?? 0), 0) / scored.length : null;
  const upToDate = groupRows.length - todoRows.length;
  const perfCount = groupRows.filter((r) => r.offer === "perf").length;
  const formationCount = groupRows.length - perfCount;

  // ---- le volet Jarvis : le brief du jour, sinon la couche 1
  const brief = group ? briefs[group.id] : undefined;
  const rowById = new Map(groupRows.map((r) => [r.id, r]));
  const recos: RecoView[] = brief
    ? brief.recommendations.map((r, i) => {
        const row = r.playerId ? rowById.get(r.playerId) : undefined;
        return {
          key: `b-${i}`,
          playerId: row ? row.id : null,
          name: row ? `${row.firstName} ${row.lastName}` : "",
          firstName: row?.firstName ?? "",
          lastName: row?.lastName ?? "",
          offer: row?.offer ?? null,
          title: r.title,
          why: r.why,
          message: r.message,
          action: r.action,
          ficheHref: row
            ? `/coach/joueurs/${row.id}?onglet=${r.action === "assign_session" ? "programme" : "messages"}`
            : null,
          history: row ? recentThreads[row.id] : undefined,
        };
      })
    : todoRows
        .filter((r) => r.unread || r.suggestion)
        .map((r) =>
          r.unread
            ? // un message attend : on y répond dans le fil, pas avec un modèle
              {
                key: `u-${r.id}`,
                playerId: r.id,
                name: `${r.firstName} ${r.lastName}`,
                firstName: r.firstName,
                lastName: r.lastName,
                offer: r.offer,
                title: "Répondre à son message",
                why: r.lastMessagePreview ? `« ${r.lastMessagePreview} »` : "Un message attend dans le fil.",
                message: null,
                action: "message" as const,
                ficheHref: `/coach/joueurs/${r.id}?onglet=messages&canal=${channelKey(r.unreadChannel)}`,
              }
            : {
                key: `s-${r.id}`,
                playerId: r.id,
                name: `${r.firstName} ${r.lastName}`,
                firstName: r.firstName,
                lastName: r.lastName,
                offer: r.offer,
                title: r.suggestion!.label,
                why: r.alerts.map((a) => a.label).join(" · "),
                message: r.suggestion!.text,
                action: "message" as const,
                ficheHref: `/coach/joueurs/${r.id}?onglet=messages`,
              }
        );

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent">{todayLabel}</p>
          <h1 className="font-display mt-1 text-[32px] font-extrabold uppercase leading-none tracking-wide text-navy-900 lg:text-[44px]">
            {viewerFirstName ? `Bonjour ${viewerFirstName}` : (group?.name ?? "Accueil")}
          </h1>
          <p className="mt-1.5 text-sm text-navy-400">
            {group?.name ?? "Accueil"}
            {group?.staffNames ? ` · ${group.staffNames}` : ""} · {groupRows.length} joueur
            {groupRows.length > 1 ? "s" : ""}
            {groupRows.length > 0 ? `, ${perfCount} perf et ${formationCount} formation` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <ReportCountdown due={reportDue} />
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="group inline-flex min-h-11 items-center gap-3 rounded-2xl border border-sand bg-white py-2 pl-2 pr-3.5 text-left text-navy-900 shadow-[0_8px_20px_-14px_rgba(15,42,74,0.4)] transition-shadow hover:shadow-[0_12px_26px_-14px_rgba(15,42,74,0.55)]"
        >
          <JarvisAvatar bare pose="happy" size={40} />
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-accent">
              Jarvis · ce matin
            </span>
            <span className="text-[13px] font-extrabold">
              {recos.length > 0
                ? `${recos.length} recommandation${recos.length > 1 ? "s" : ""}`
                : "Parler à Jarvis"}
            </span>
          </span>
          <ChevronRight
            size={16}
            strokeWidth={2.4}
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
        </div>
      </header>

      {/* ---- les chiffres du groupe ---- */}
      <StatStrip
        className="mb-5"
        items={[
          {
            label: "Messages en attente",
            value: `${unreadCount}`,
            tone: unreadCount > 0 ? "danger" : "default",
          },
          { label: "Bilans à répondre", value: `${toReply}` },
          { label: "Bilans reçus", value: `${received}/${expected.length}` },
          { label: "Discipline moyenne", value: formatPercent(avg) },
          { label: "Joueurs à jour", value: `${upToDate}`, hint: `sur ${groupRows.length}` },
        ]}
      />

      {/* ---- filtres : une barre, trois groupes étiquetés, défilement à droite ---- */}
      <div className="shadow-soft mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-[18px] bg-white px-4 py-3">
        {groups.length > 1 && (
          <FilterGroup label="Groupe">
            {groups.map((g) => (
              <Segment key={g.id} on={g.id === group?.id} onClick={() => setGroupId(g.id)}>
                {g.name}
              </Segment>
            ))}
          </FilterGroup>
        )}
        <FilterGroup label="Afficher">
          <Segment on={scope === "todo"} onClick={() => setScope("todo")}>
            À traiter <Count n={todoRows.length} on={scope === "todo"} />
          </Segment>
          <Segment on={scope === "all"} onClick={() => setScope("all")}>
            Tous <Count n={groupRows.length} on={scope === "all"} />
          </Segment>
        </FilterGroup>
        <FilterGroup label="Offre">
          <Segment on={offer === "all"} onClick={() => setOffer("all")}>
            Toutes
          </Segment>
          <Segment on={offer === "perf"} onClick={() => setOffer("perf")}>
            Perf <Count n={perfCount} on={offer === "perf"} />
          </Segment>
          <Segment on={offer === "formation"} onClick={() => setOffer("formation")}>
            Formation <Count n={formationCount} on={offer === "formation"} />
          </Segment>
        </FilterGroup>
        <span className="hidden md:contents">
          {/* l'historique est masqué d'entrée : un clic sur une durée l'affiche */}
          <FilterGroup label="Historique">
            <Segment on={!showHistory} onClick={() => setShowHistory(false)}>
              Masqué
            </Segment>
            {HISTORY_WEEK_CHOICES.map((n) => (
              <Segment
                key={n}
                on={showHistory && n === weeks}
                onClick={() => {
                  setShowHistory(true);
                  if (n !== weeks) router.push(`/coach?semaines=${n}`);
                }}
              >
                {n === 8 ? "8 semaines" : n === 13 ? "3 mois" : "6 mois"}
              </Segment>
            ))}
          </FilterGroup>
          {showHistory && (
            <span className="inline-flex items-end gap-1.5 self-end">
              <button
                type="button"
                onClick={() => scrollTable(-480)}
                className="inline-flex h-9 items-center gap-1 rounded-xl bg-cream px-3 text-[12px] font-semibold text-navy-600 hover:bg-sand"
              >
                <ChevronLeft size={14} /> Aujourd&apos;hui
              </button>
              <button
                type="button"
                onClick={() => scrollTable(480)}
                className="inline-flex h-9 items-center gap-1 rounded-xl bg-cream px-3 text-[12px] font-semibold text-navy-600 hover:bg-sand"
              >
                Semaines passées <ChevronRight size={14} />
              </button>
            </span>
          )}
        </span>
      </div>
      <div
        ref={scroller}
        className="shadow-soft hidden overflow-x-auto rounded-[20px] bg-white md:block"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {[
                "Joueur",
                "Offre",
                ...(showKickoff ? ["Visio départ"] : []),
                "Santé",
                "Douleur",
                "Discipline",
                "Semaine",
                "Bilan",
                "Scoring",
                "Échange",
                "Action",
                "Appeler",
              ].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`whitespace-nowrap border-b border-navy-100 bg-navy-50 px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-navy-400 ${
                    i === 0 ? "sticky left-0 z-20" : ""
                  }`}
                >
                  {h}
                </th>
              ))}
              {showHistory && visible[0]?.history.map((c) => (
                <th
                  key={c.weekStart}
                  scope="col"
                  className="whitespace-nowrap border-b border-l border-navy-100 bg-navy-50 px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-navy-400"
                >
                  Sem. {c.weekStart.slice(8, 10)}/{c.weekStart.slice(5, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-navy-400">
                  {scope === "todo"
                    ? "Rien à traiter : messages lus, bilans répondus, plannings en place."
                    : "Aucun joueur."}
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const frozen = r.availability !== "available";
              const silence = r.alerts.find((a) => a.key === "silence");
              return (
                <tr key={r.id} className="group">
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap border-b border-navy-50 bg-white px-3 py-2 group-hover:bg-navy-50 ${
                      r.critical ? "shadow-[inset_3px_0_0_0_#b91c1c]" : ""
                    }`}
                  >
                    <Link href={`/coach/joueurs/${r.id}`} className="inline-flex items-center gap-2.5 hover:underline">
                      <PlayerAvatar firstName={r.firstName} lastName={r.lastName} size="sm" alert={r.unread} />
                      <span className="font-bold text-navy-900">
                        {r.firstName} {r.lastName}
                      </span>
                    </Link>
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <OfferMark offer={r.offer} />
                  </td>
                  {showKickoff && (
                    <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                      {r.kickoffExpected && (
                        <KickoffBox playerId={r.id} doneAt={r.kickoffDoneAt} canEdit={isAdmin} />
                      )}
                    </td>
                  )}
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <HealthCell row={r} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <PainCell pain={r.pain} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <span className="inline-flex items-center gap-3">
                      <DisciplineBar value={r.discipline} frozen={frozen} />
                      {!frozen && <Sparkline history={r.history} trend={r.trend} />}
                    </span>
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 tabular-nums group-hover:bg-navy-50/50">
                    {frozen ? (
                      <span className="text-navy-300">—</span>
                    ) : r.weekPlanned === 0 ? (
                      <Tag tone="amber">Planning vide</Tag>
                    ) : (
                      <span className="font-semibold text-navy-900">
                        {r.weekDone} / {r.weekPlanned}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <ReviewCell review={r.reviewDetail} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <ScoreCell matches={r.matches} trend={r.scoreTrend} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    {r.unread && r.lastExchangeAt ? (
                      <Tag tone="red">Message · {formatAgoFr(r.lastExchangeAt)}</Tag>
                    ) : silence ? (
                      <Tag tone="amber">{silence.label}</Tag>
                    ) : r.lastExchangeAt ? (
                      <span className="text-xs text-navy-400">{formatAgoFr(r.lastExchangeAt)}</span>
                    ) : (
                      <span className="text-xs text-navy-300">aucun</span>
                    )}
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <ActionLink action={primaryAction(r)} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <CallLinks name={r.firstName} playerUrl={r.playerWhatsapp} parent={r.parentWhatsapp} />
                  </td>
                  {showHistory && r.history.map((c) => (
                    <td
                      key={c.weekStart}
                      className="border-b border-l border-navy-50 px-3 py-2 group-hover:bg-navy-50/50"
                    >
                      <WeekHistoryCell cell={c} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="sticky left-0 px-4 py-2 text-[11px] text-navy-300">
          {visible.length} ligne{visible.length > 1 ? "s" : ""} · urgences d&apos;abord · le nom ouvre la fiche
          {showHistory ? " · à droite, les semaines passées (pointages, point = bilan rendu)" : ""}
        </p>
      </div>

      {/* ---- la liste (téléphone) ---- */}
      <div className="space-y-2 md:hidden">
        {visible.length === 0 && (
          <p className="rounded-2xl border border-navy-100 bg-white px-4 py-6 text-center text-sm text-navy-400">
            {scope === "todo" ? "Rien à traiter aujourd'hui." : "Aucun joueur."}
          </p>
        )}
        {visible.map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl border bg-white px-3 py-3 ${r.critical ? "border-danger/40" : "border-navy-100"}`}
          >
            <div className="flex items-center gap-2.5">
              <PlayerAvatar firstName={r.firstName} lastName={r.lastName} alert={r.unread} />
              <Link href={`/coach/joueurs/${r.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-navy-900">
                  {r.firstName} {r.lastName}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-navy-400">
                  <OfferMark offer={r.offer} />
                  {formatPercent(r.discipline)} · {r.weekDone}/{r.weekPlanned}
                  {r.matches[0] && ` · ${r.matches[0].points} pts`}
                </span>
              </Link>
              <ActionLink action={primaryAction(r)} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              {r.kickoffExpected ? (
                <KickoffBox playerId={r.id} doneAt={r.kickoffDoneAt} canEdit={isAdmin} />
              ) : (
                <span />
              )}
              <CallLinks name={r.firstName} playerUrl={r.playerWhatsapp} parent={r.parentWhatsapp} />
            </div>
            {r.alerts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.alerts.slice(0, 4).map((a) => (
                  <Tag key={a.key} tone={a.severity === "danger" ? "red" : "amber"}>
                    {a.label}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ---- le volet Jarvis, par-dessus ---- */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Fermer le volet"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-navy-900/40"
          />
          <aside
            role="dialog"
            aria-labelledby="claude-panel-title"
            className="relative flex h-full w-full max-w-[560px] flex-col bg-cream shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4">
              <h2 id="claude-panel-title" className="font-display flex items-center gap-2 text-[19px] font-bold uppercase tracking-wide text-navy-900">
                <JarvisAvatar size={30} />
                Jarvis · {group?.name ?? "Accueil"}
              </h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-full text-navy-500 hover:bg-navy-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {brief ? (
                <div className="rounded-2xl bg-navy-800 px-4 py-3.5 text-white">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy-300">
                    Le mot du matin · {formatAgoFr(brief.createdAt)}
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-navy-100">{brief.summary}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-navy-200 bg-white px-4 py-3.5">
                  <p className="text-[13px] font-semibold text-navy-800">
                    {briefConfigured
                      ? "Pas encore de brief aujourd'hui."
                      : "Le passage du matin n'est pas encore branché."}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-navy-500">
                    {briefConfigured
                      ? isAdmin
                        ? "Il s'écrit à 7h. Tu peux le lancer maintenant depuis Admin › À savoir sur Jarvis."
                        : "Il s'écrit à 7h."
                      : "Il manque la clé API Anthropic. En attendant, voici les messages proposés par les règles de l'app."}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy-400">
                  Parler à Jarvis
                </p>
                <JarvisChat
                  groupId={group && group.id !== NO_GROUP_ID ? group.id : null}
                  configured={briefConfigured}
                />
              </div>

              <div>
                <p className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy-400">
                  Recommandations · {recos.length}
                </p>
                {recos.length === 0 ? (
                  <p className="rounded-2xl border border-navy-100 bg-white px-4 py-4 text-[13px] text-navy-400">
                    Rien à proposer : le groupe est à jour.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {recos.map((r) => (
                      <RecoCard key={r.key} reco={r} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy-400">
                  Aujourd&apos;hui dans le journal · {journalToday.length}
                </p>
                {journalToday.length === 0 ? (
                  <p className="px-1 text-[12.5px] text-navy-400">Rien encore aujourd&apos;hui.</p>
                ) : (
                  <ul className="rounded-2xl border border-navy-100 bg-white px-4 py-1">
                    {journalToday.map((e) => (
                      <li key={e.id} className="flex items-baseline gap-2 border-b border-navy-50 py-2 text-[12.5px] last:border-b-0">
                        <span className="shrink-0 tabular-nums text-navy-300">{e.at}</span>
                        <span className="text-navy-600">
                          <span className={`font-semibold ${e.actorKind === "claude" ? "text-navy-900" : "text-navy-800"}`}>
                            {e.actorName}
                          </span>{" "}
                          {e.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
