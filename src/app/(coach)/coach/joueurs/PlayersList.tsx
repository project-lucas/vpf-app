"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  ChevronRight,
  HeartPulse,
  MessageCircle,
  Search,
} from "lucide-react";
import { PlayerAvatar } from "@/components/coach/PlayerAvatar";
import { RowMenu } from "@/components/coach/RowMenu";
import { PlayerWhatsAppLink } from "@/components/coach/PlayerWhatsAppLink";
import { OfferMark } from "@/components/coach/HomeCells";
import { JarvisPlayerBox } from "@/components/coach/JarvisPlayerBox";
import { Row } from "@/components/ui/Row";
import { formatPercent } from "@/lib/discipline";
import { formatAgoFr } from "@/lib/dates";
import { AVAILABILITY_LABELS, LOW_DISCIPLINE_THRESHOLD, channelKey } from "@/lib/constants";
import type { BriefRecommendation } from "@/lib/briefs";
import type { PlayerAvailability, PlayerOffer, SessionPole } from "@/lib/types";

export type PoleProgress = Record<SessionPole, { done: number; total: number }>;

/**
 * Le fil à ouvrir pour ce joueur : celui qui attend, sinon le plus récent.
 */
export interface PlayerInboxSummary {
  /** null = fil global ; sinon le porteur du fil privé */
  channelAdminId: string | null;
  lastAt: string | null;
  hasUnread: boolean;
}

export interface PlayerListItem {
  id: string;
  first_name: string;
  last_name: string;
  season_goal: string;
  offer: PlayerOffer;
  availability: PlayerAvailability;
  discipline: number | null;
  progress: PoleProgress | null;
  /** vide tant que le coach n'a pas saisi le numéro dans la fiche du joueur */
  whatsapp_number: string;
  /** groupe de suivi (0040) — pour Jarvis */
  group_id: string | null;
  /** un message de ce joueur (ou de ses parents) attend une réponse */
  has_unread_messages: boolean;
  /** dernier check-in énergie / douleurs */
  energy: { score: number; at: string } | null;
  pain: { score: number; at: string } | null;
  /** semaine en cours : pointages, feuille de match, bilan */
  week: { planned: number; done: number; sheetPoints: number | null; hasReview: boolean } | null;
  inbox: PlayerInboxSummary | null;
}

type View = "messages" | "discipline" | "sante" | "semaine";

/**
 * Rang d'urgence d'un joueur : message en attente, puis douleur, puis
 * discipline faible, puis les autres. Le seul tri de la liste : on lit de
 * haut en bas et l'on tombe d'abord sur ce qui compte.
 */
function priorityOf(p: PlayerListItem): number {
  if (p.has_unread_messages) return 0;
  if (p.pain && p.pain.score >= 5) return 1;
  if (p.availability === "injured") return 2;
  if (p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD) return 3;
  return 4;
}

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "messages", label: "Messages", icon: <MessageCircle size={14} /> },
  { key: "discipline", label: "Discipline", icon: <Activity size={14} /> },
  { key: "sante", label: "Santé", icon: <HeartPulse size={14} /> },
  { key: "semaine", label: "Semaine", icon: <CalendarCheck size={14} /> },
];

const POLE_SHORT: Record<SessionPole, string> = {
  basket: "Tech",
  physique: "Phys",
  routine: "Rout",
};

/** Ordinateur (≥ lg) : liste à gauche, aperçu du joueur à droite. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

/**
 * La liste des joueurs — et la boîte de réception du staff.
 *
 * Une seule liste, triée par urgence (message en attente, douleur, blessé,
 * discipline faible, puis le plus récent échange, puis A → Z). Sous le nom,
 * des signaux en mots — « Discipline 0 % », « Semaine 2/6 », « Douleur
 * 6/10 » — colorés seulement s'ils alertent ; l'offre en lettre (P / F) à côté
 * du nom.
 *
 * Sur téléphone, une ligne ouvre la fiche. Sur ordinateur, elle sélectionne le
 * joueur et l'aperçu à droite montre ses signaux, ses suggestions Jarvis du
 * matin et la discussion avec Jarvis à son sujet, avec les raccourcis vers la
 * fiche.
 */
export function PlayersList({
  players,
  initialView = "messages",
  recosByPlayer = {},
  briefConfigured = false,
}: {
  players: PlayerListItem[];
  initialView?: View;
  recosByPlayer?: Record<string, BriefRecommendation[]>;
  briefConfigured?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(initialView);
  const desktop = useIsDesktop();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
      : players;
    return [...filtered].sort((a, b) => {
      const pa = priorityOf(a);
      const pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      const at = a.inbox?.lastAt ?? "";
      const bt = b.inbox?.lastAt ?? "";
      if (at !== bt) return at < bt ? 1 : -1;
      return a.first_name.localeCompare(b.first_name, "fr");
    });
  }, [players, query]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = shown.find((p) => p.id === selectedId) ?? shown[0] ?? null;
  const unreadCount = players.filter((p) => p.has_unread_messages).length;

  const list = (
    <div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-navy-400">Aucun joueur ne correspond à « {query} ».</p>
      ) : (
        shown.map((p) => {
          const name = `${p.first_name} ${p.last_name}`.trim();
          const href =
            view === "messages"
              ? `/coach/joueurs/${p.id}?onglet=messages&canal=${channelKey(p.inbox?.channelAdminId ?? null)}`
              : `/coach/joueurs/${p.id}`;
          const isSel = desktop && selected?.id === p.id;
          return (
            <Row
              key={p.id}
              href={desktop ? undefined : href}
              onClick={desktop ? () => setSelectedId(p.id) : undefined}
              airy
              boxed
              className={isSel ? "ring-2 ring-accent" : ""}
              leading={<PlayerAvatar firstName={p.first_name} lastName={p.last_name} />}
              emphasis={p.has_unread_messages}
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{name}</span>
                  <OfferMark offer={p.offer} />
                </span>
              }
              subtitle={view === "messages" ? <PlayerSignals player={p} /> : <Subtitle player={p} view={view} />}
              right={
                <>
                  {view === "messages" ? (
                    <>
                      {p.has_unread_messages && (
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white"
                          title="Message non lu"
                        >
                          <MessageCircle size={13} strokeWidth={2.5} />
                          <span className="sr-only">Message non lu</span>
                        </span>
                      )}
                      {p.inbox?.lastAt && (
                        <span
                          className={`text-[11px] tabular-nums ${
                            p.has_unread_messages ? "font-bold text-accent" : "text-navy-400"
                          }`}
                        >
                          {formatAgoFr(p.inbox.lastAt)}
                        </span>
                      )}
                    </>
                  ) : (
                    <Primary player={p} view={view} />
                  )}
                  <RowMenu playerId={p.id} playerName={name} availability={p.availability} />
                </>
              }
            />
          );
        })
      )}
    </div>
  );

  return (
    <>
      {/* recherche et vues sur une même rangée */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 sm:w-72">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un joueur"
            aria-label="Rechercher un joueur"
            className="shadow-soft w-full rounded-xl border-0 bg-white py-2.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="shadow-soft flex flex-1 gap-0.5 rounded-xl bg-white p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={`relative flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 text-[11.5px] font-bold transition-colors ${
                view === v.key ? "bg-navy-800 text-white" : "text-navy-500 hover:text-navy-900"
              }`}
            >
              {v.icon}
              <span className="truncate">{v.label}</span>
              {v.key === "messages" && unreadCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-extrabold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {desktop && selected ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-start gap-5">
          {list}
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <PlayerPreview
              key={selected.id}
              player={selected}
              recos={recosByPlayer[selected.id] ?? []}
              briefConfigured={briefConfigured}
            />
          </div>
        </div>
      ) : (
        list
      )}
    </>
  );
}

/** L'aperçu d'un joueur sur ordinateur : signaux, raccourcis, Jarvis. */
function PlayerPreview({
  player: p,
  recos,
  briefConfigured,
}: {
  player: PlayerListItem;
  recos: BriefRecommendation[];
  briefConfigured: boolean;
}) {
  const name = `${p.first_name} ${p.last_name}`.trim();
  const fiche = `/coach/joueurs/${p.id}`;
  return (
    <div className="space-y-4">
      <section className="shadow-soft rounded-[20px] bg-white p-5">
        <div className="flex items-center gap-4">
          <span className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-navy-800 to-navy-600 text-[22px] font-extrabold text-white">
            {`${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-[26px] font-extrabold uppercase leading-none text-navy-900">
              {name}
            </p>
            <p className="mt-1.5 flex items-center gap-2 text-[12.5px]">
              <OfferMark offer={p.offer} />
              <PlayerSignals player={p} />
            </p>
          </div>
          <PlayerWhatsAppLink whatsappNumber={p.whatsapp_number} playerName={name} size="md" />
        </div>
        {p.season_goal && (
          <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-[12.5px] text-navy-600">
            <span className="font-bold text-navy-800">Objectif : </span>
            {p.season_goal}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            { label: "Messages", href: `${fiche}?onglet=messages&canal=${channelKey(p.inbox?.channelAdminId ?? null)}` },
            { label: "Semaine", href: `${fiche}?onglet=semaine` },
            { label: "Programme", href: `${fiche}?onglet=programme` },
            { label: "Fiche complète", href: fiche },
          ].map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="inline-flex min-h-9 items-center gap-0.5 rounded-xl bg-cream px-3 text-[12.5px] font-semibold text-navy-700 hover:bg-sand"
            >
              {l.label}
              <ChevronRight size={13} />
            </Link>
          ))}
        </div>
      </section>
      <JarvisPlayerBox
        playerId={p.id}
        firstName={p.first_name}
        groupId={p.group_id}
        recos={recos}
        configured={briefConfigured}
      />
    </div>
  );
}

/** Un signal en mots, gris par défaut, coloré seulement s'il alerte. */
function Signal({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "danger" | "warning";
}) {
  const color =
    tone === "danger" ? "font-bold text-danger" : tone === "warning" ? "font-bold text-warning" : "text-navy-500";
  return <span className={`tabular-nums ${color}`}>{children}</span>;
}

/**
 * Ce qu'un coach veut savoir avant d'ouvrir : la dispo si elle n'est pas
 * « disponible », la discipline, la semaine, l'énergie et la douleur du
 * dernier check-in. En mots, pas en icônes.
 */
function PlayerSignals({ player: p }: { player: PlayerListItem }) {
  const items: React.ReactNode[] = [];
  if (p.availability !== "available") {
    items.push(
      <Signal key="dispo" tone={p.availability === "injured" ? "danger" : "warning"}>
        {AVAILABILITY_LABELS[p.availability]}
      </Signal>
    );
  }
  if (p.discipline !== null) {
    items.push(
      <Signal key="disc" tone={p.discipline < LOW_DISCIPLINE_THRESHOLD ? "danger" : "muted"}>
        Discipline {formatPercent(p.discipline)}
      </Signal>
    );
  }
  if (p.week && p.week.planned > 0) {
    items.push(
      <Signal key="sem">
        Semaine {p.week.done}/{p.week.planned}
      </Signal>
    );
  }
  if (p.energy) {
    items.push(
      <Signal key="nrj" tone={p.energy.score <= 4 ? "warning" : "muted"}>
        Énergie {p.energy.score}/10
      </Signal>
    );
  }
  if (p.pain && p.pain.score > 0) {
    items.push(
      <Signal key="dlr" tone={p.pain.score >= 5 ? "danger" : p.pain.score >= 3 ? "warning" : "muted"}>
        Douleur {p.pain.score}/10
      </Signal>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-[12px]">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-x-2">
          {i > 0 && (
            <span aria-hidden className="text-navy-200">
              ·
            </span>
          )}
          {item}
        </span>
      ))}
    </span>
  );
}

/** La valeur de droite, selon la vue. */
function Primary({ player: p, view }: { player: PlayerListItem; view: View }) {
  if (view === "discipline") {
    const low = p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD;
    return (
      <span
        className={`text-sm font-extrabold tabular-nums ${
          p.discipline === null ? "text-navy-300" : low ? "text-danger" : "text-navy-900"
        }`}
      >
        {formatPercent(p.discipline)}
      </span>
    );
  }
  if (view === "sante") {
    if (!p.pain && !p.energy) return <span className="text-xs text-navy-300">—</span>;
    return (
      <span className="flex items-center gap-2 text-xs font-bold tabular-nums">
        {p.energy && (
          <span className={p.energy.score <= 4 ? "text-warning" : "text-navy-700"}>Énergie {p.energy.score}</span>
        )}
        {p.pain && (
          <span className={p.pain.score >= 5 ? "text-danger" : "text-navy-700"}>Douleur {p.pain.score}</span>
        )}
      </span>
    );
  }
  const w = p.week;
  if (!w || w.planned === 0) return <span className="text-xs text-navy-300">—</span>;
  return (
    <span className={`text-sm font-extrabold tabular-nums ${w.done >= w.planned ? "text-success" : "text-navy-900"}`}>
      {w.done}/{w.planned}
    </span>
  );
}

/** La ligne secondaire, selon la vue. Le message en attente passe toujours en premier. */
function Subtitle({ player: p, view }: { player: PlayerListItem; view: View }) {
  const parts: string[] = [];
  if (view === "discipline") {
    if (p.season_goal) parts.push(p.season_goal);
  } else if (view === "sante") {
    const last = p.pain?.at ?? p.energy?.at;
    parts.push(last ? `Dernier check-in ${formatAgoFr(last)}` : "Aucun check-in");
  } else {
    if (p.progress) {
      for (const pole of Object.keys(POLE_SHORT) as SessionPole[]) {
        const s = p.progress[pole];
        if (s.total > 0) parts.push(`${POLE_SHORT[pole]} ${s.done}/${s.total}`);
      }
    }
    if (p.week?.sheetPoints !== null && p.week?.sheetPoints !== undefined) {
      parts.push(`${p.week.sheetPoints} pts`);
    }
    parts.push(p.week?.hasReview ? "Bilan reçu" : "Bilan à venir");
  }
  return (
    <>
      {p.has_unread_messages && (
        <span className="font-bold text-accent">Message en attente{parts.length > 0 && " · "}</span>
      )}
      {parts.join(" · ")}
    </>
  );
}
