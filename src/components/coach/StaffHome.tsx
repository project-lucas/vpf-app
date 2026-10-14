"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Pencil, Send, Sparkles, X } from "lucide-react";
import { sendConversationMessage } from "@/app/actions/messages";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlayerAvatar } from "@/components/coach/PlayerAvatar";
import { JarvisChat } from "@/components/coach/JarvisChat";
import {
  CallLinks,
  KickoffBox,
  OfferMark,
  ScoreCell,
  Sparkline,
  WeekHistoryCell,
} from "@/components/coach/HomeCells";
import { AVAILABILITY_LABELS, MESSAGE_MAX_LENGTH, channelKey } from "@/lib/constants";
import { formatPercent } from "@/lib/discipline";
import { formatAgoFr } from "@/lib/dates";
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
}

// ---------------------------------------------------------------------------
// Petites briques
// ---------------------------------------------------------------------------

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors ${
        on
          ? "border border-navy-800 bg-navy-800 text-white"
          : "border border-navy-100 bg-white text-navy-500 hover:border-navy-300"
      }`}
    >
      {children}
    </button>
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
  const color = pct < 60 ? "bg-danger" : pct < 80 ? "bg-warning" : "bg-navy-800";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative block h-1.5 w-14 overflow-hidden rounded-full bg-navy-100">
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-xs font-semibold tabular-nums text-navy-900">{pct} %</span>
    </span>
  );
}

function ProgramDots({ row }: { row: HomeRow }) {
  const c = row.coverage;
  if (!c) return <span className="text-xs text-navy-300">—</span>;
  const poles: [string, number][] = [
    ["Technique", c.byPole.basket],
    ["Physique", c.byPole.physique],
    ["Routine", c.byPole.routine],
  ];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex gap-1"
        aria-label={poles.map(([l, n]) => `${l} ${n > 0 ? "oui" : "non"}`).join(", ")}
      >
        {poles.map(([l, n]) => (
          <span key={l} className={`h-2 w-2 rounded-full ${n > 0 ? "bg-navy-800" : "bg-navy-100"}`} />
        ))}
      </span>
      {c.hidden > 0 && <Tag tone="amber">{c.hidden} sans jour</Tag>}
    </span>
  );
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
    default:
      return { label: "Écrire", href: `${fiche}?onglet=messages`, tone: "ghost" };
  }
}

function ActionLink({ action }: { action: ReturnType<typeof primaryAction> }) {
  if (!action) return <span className="text-xs text-navy-300">à jour</span>;
  const look = {
    danger: "bg-danger text-white hover:opacity-90",
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
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [groupId, setGroupId] = useState(initialGroupId);
  const [scope, setScope] = useState<Scope>("todo");
  const [offer, setOffer] = useState<OfferFilter>("all");
  const [panelOpen, setPanelOpen] = useState(false);
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
      <PageHeader
        title={group?.name ?? "Accueil"}
        subtitle={`${todayLabel}${group?.staffNames ? ` · ${group.staffNames}` : ""} · ${groupRows.length} joueur${
          groupRows.length > 1 ? "s" : ""
        }${groupRows.length > 0 ? `, ${perfCount} perf et ${formationCount} formation` : ""}`}
        action={
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-navy-800 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-navy-700"
          >
            <Sparkles size={15} />
            Recommandations
            {recos.length > 0 && (
              <span className="rounded-full bg-gold px-1.5 py-0.5 text-[10.5px] font-extrabold text-navy-900">
                {recos.length}
              </span>
            )}
          </button>
        }
      />

      {/* ---- les chiffres du groupe : une ligne blanche, pas le tableau d'affichage ---- */}
      <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-navy-100 bg-white sm:grid-cols-3 lg:flex">
        {[
          { v: `${unreadCount}`, l: "messages en attente", hot: unreadCount > 0 },
          { v: `${toReply}`, l: "bilans à répondre", hot: false },
          { v: `${received}/${expected.length}`, l: "bilans reçus", hot: false },
          { v: formatPercent(avg), l: "discipline moyenne", hot: false },
          { v: `${upToDate}`, l: "joueurs à jour", hot: false },
        ].map((k) => (
          <div
            key={k.l}
            className="flex items-baseline gap-2 border-b border-r border-navy-100 px-4 py-3 last:border-r-0 lg:flex-1 lg:border-b-0"
          >
            <span className={`font-display text-[26px] font-bold leading-none ${k.hot ? "text-danger" : "text-navy-900"}`}>
              {k.v}
            </span>
            <span className="text-[11.5px] leading-tight text-navy-400">{k.l}</span>
          </div>
        ))}
      </div>

      {/* ---- filtres ---- */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {groups.length > 1 &&
          groups.map((g) => (
            <Pill key={g.id} on={g.id === group?.id} onClick={() => setGroupId(g.id)}>
              {g.name}
            </Pill>
          ))}
        {groups.length > 1 && <span aria-hidden className="mx-1 h-5 w-px bg-navy-100" />}
        <Pill on={scope === "todo"} onClick={() => setScope("todo")}>
          À traiter · {todoRows.length}
        </Pill>
        <Pill on={scope === "all"} onClick={() => setScope("all")}>
          Tous · {groupRows.length}
        </Pill>
        <span aria-hidden className="mx-1 h-5 w-px bg-navy-100" />
        <Pill on={offer === "all"} onClick={() => setOffer("all")}>
          Les deux offres
        </Pill>
        <Pill on={offer === "perf"} onClick={() => setOffer("perf")}>
          Perf · {perfCount}
        </Pill>
        <Pill on={offer === "formation"} onClick={() => setOffer("formation")}>
          Formation · {formationCount}
        </Pill>
      </div>

      {/* ---- le tableau (ordinateur) : défile à l'horizontale vers le passé ---- */}
      <div className="mb-2 hidden items-center justify-between gap-2 md:flex">
        <span className="text-[11.5px] text-navy-400">
          Historique :
          {HISTORY_WEEK_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => router.push(`/coach?semaines=${n}`)}
              className={`ml-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                n === weeks ? "bg-navy-800 text-white" : "text-navy-500 hover:bg-navy-50"
              }`}
            >
              {n === 8 ? "8 sem." : n === 13 ? "3 mois" : "6 mois"}
            </button>
          ))}
        </span>
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollTable(-480)}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-navy-100 bg-white px-2.5 text-[11.5px] font-semibold text-navy-600 hover:bg-navy-50"
          >
            <ChevronLeft size={14} /> Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => scrollTable(480)}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-navy-100 bg-white px-2.5 text-[11.5px] font-semibold text-navy-600 hover:bg-navy-50"
          >
            Semaines passées <ChevronRight size={14} />
          </button>
        </span>
      </div>
      <div
        ref={scroller}
        className="hidden overflow-x-auto rounded-2xl border border-navy-100 bg-white md:block"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {[
                "Joueur",
                "Offre",
                ...(showKickoff ? ["Visio départ"] : []),
                "Dispo",
                "Discipline",
                "Tendance",
                "Semaine",
                "Bilan",
                "Scoring",
                "Échange",
                "Programme",
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
              {visible[0]?.history.map((c) => (
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
                <td colSpan={13} className="px-4 py-8 text-center text-sm text-navy-400">
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
                    {r.alerts.some((a) => a.key === "pain") && r.pain ? (
                      <Tag tone="red">Douleur {r.pain.score}/10</Tag>
                    ) : frozen ? (
                      <Tag tone={r.availability === "injured" ? "red" : "amber"}>
                        {AVAILABILITY_LABELS[r.availability]}
                      </Tag>
                    ) : (
                      <span className="text-xs text-navy-400">Dispo</span>
                    )}
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <DisciplineBar value={r.discipline} frozen={frozen} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <Sparkline history={r.history} trend={r.trend} />
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
                    {r.review === "to-reply" ? (
                      <Tag tone="red">À répondre{r.reviewHealth && r.reviewHealth !== "ok" ? " · santé" : ""}</Tag>
                    ) : r.review === "missing" ? (
                      <Tag tone="amber">Manquant</Tag>
                    ) : r.review === "replied" ? (
                      <span className="text-xs text-navy-400">Répondu</span>
                    ) : (
                      <span className="text-navy-300">—</span>
                    )}
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
                    <ProgramDots row={r} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <ActionLink action={primaryAction(r)} />
                  </td>
                  <td className="border-b border-navy-50 px-3 py-2 group-hover:bg-navy-50/50">
                    <CallLinks name={r.firstName} playerUrl={r.playerWhatsapp} parent={r.parentWhatsapp} />
                  </td>
                  {r.history.map((c) => (
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
          {visible.length} ligne{visible.length > 1 ? "s" : ""} · urgences d&apos;abord · le nom ouvre la fiche ·
          à droite, les semaines passées (pointages, point = bilan rendu)
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
              <KickoffBox playerId={r.id} doneAt={r.kickoffDoneAt} canEdit={isAdmin} />
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
                <Sparkles size={17} className="text-gold" />
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
                        ? "Il s'écrit à 7h. Tu peux le lancer maintenant depuis Admin › Jarvis du matin."
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
