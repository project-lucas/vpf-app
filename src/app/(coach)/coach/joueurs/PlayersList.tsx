"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CalendarCheck,
  HeartPulse,
  MessageCircle,
  Search,
  Zap,
} from "lucide-react";
import { PlayerAvatar } from "@/components/coach/PlayerAvatar";
import { RowMenu } from "@/components/coach/RowMenu";
import { PlayerWhatsAppLink } from "@/components/coach/PlayerWhatsAppLink";
import { Badge } from "@/components/ui/Badge";
import { Row } from "@/components/ui/Row";
import { formatPercent } from "@/lib/discipline";
import { formatAgoFr } from "@/lib/dates";
import { AVAILABILITY_LABELS, LOW_DISCIPLINE_THRESHOLD, channelKey } from "@/lib/constants";
import { OFFER_LABELS } from "@/lib/offers";
import type { PlayerAvailability, PlayerOffer, SessionPole } from "@/lib/types";

export type PoleProgress = Record<SessionPole, { done: number; total: number }>;

/**
 * Le fil à ouvrir pour ce joueur : celui qui attend, sinon le plus récent.
 * Pas d'aperçu du message — la liste ne le montre plus, il n'a donc rien à
 * faire dans la charge envoyée au navigateur.
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
  /** ce joueur m'est affecté (coach référent) — il passe en haut de la liste */
  is_mine: boolean;
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
type SortKey = "priority" | "name" | "discipline-asc" | "discipline-desc";

/**
 * Rang d'urgence d'un joueur : message en attente, puis douleur, puis
 * discipline faible, puis les autres. Le tri par défaut — le coach lit la
 * liste de haut en bas et tombe d'abord sur ce qui compte.
 */
function priorityOf(p: PlayerListItem): number {
  if (p.has_unread_messages) return 0;
  if (p.pain && p.pain.score >= 5) return 1;
  if (p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD) return 2;
  return 3;
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

/**
 * La liste unique des joueurs — et la boîte de réception du staff.
 *
 * Une ligne = UN joueur, jamais un canal : le fil à ouvrir (celui qui attend,
 * sinon le plus récent) est choisi côté serveur et suit le lien. Cliquer une
 * ligne ouvre directement la conversation dans la fiche : plus de réponse
 * repliée dans la liste, un seul endroit où l'on écrit.
 *
 * La vue Messages ne montre **pas** l'aperçu du dernier message : un fil se
 * lit dans le fil. En revanche, elle dit tout ce qu'un coach veut savoir
 * AVANT d'ouvrir : sous le nom, une ligne de signaux compacts
 * (`PlayerSignals` — dispo, discipline, semaine, énergie/douleur, offre),
 * chacun coloré seulement s'il alerte. À droite : l'ancienneté du dernier
 * échange, la pastille rouge à icône message s'il y a du non-lu, le menu.
 * Toujours une seule pilule par ligne : les signaux sont du texte, pas des
 * badges.
 *
 * Deux groupes : **mes joueurs** d'abord, puis le reste du club (un admin voit
 * tout le club, un coach ne voit que les siens — c'est la RLS qui tranche).
 *
 * Quatre vues commutables changent la colonne de droite : Messages (la vue
 * d'entrée), Discipline, Santé, Semaine. Une seule mise en page à apprendre
 * pour tout ce qu'un coach regarde chaque jour.
 */
export function PlayersList({
  players,
  initialView = "messages",
}: {
  players: PlayerListItem[];
  initialView?: View;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(initialView);
  const [sort, setSort] = useState<SortKey>("priority");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
      : players;

    // dans chaque groupe : la vue Messages est une messagerie (du plus récent
    // au plus ancien, les joueurs sans message en bas), les autres suivent le
    // tri choisi
    const within = (a: PlayerListItem, b: PlayerListItem): number => {
      if (view === "messages") {
        const at = a.inbox?.lastAt ?? "";
        const bt = b.inbox?.lastAt ?? "";
        if (at && bt) return at < bt ? 1 : -1;
        if (at) return -1;
        if (bt) return 1;
        return 0;
      }
      if (sort === "name") return 0; // déjà triés par prénom côté serveur
      if (sort === "priority") return priorityOf(a) - priorityOf(b);
      if (a.discipline === null) return 1;
      if (b.discipline === null) return -1;
      return sort === "discipline-asc" ? a.discipline - b.discipline : b.discipline - a.discipline;
    };

    // mes joueurs d'abord, quel que soit le tri : c'est mon suivi, le reste
    // du club est de la supervision
    return [...filtered].sort((a, b) => {
      if (a.is_mine !== b.is_mine) return a.is_mine ? -1 : 1;
      return within(a, b);
    });
  }, [players, query, sort, view]);

  const unreadCount = players.filter((p) => p.has_unread_messages).length;
  // pas de séparateur si tout le monde est dans le même groupe
  const hasBothGroups = shown.some((p) => p.is_mine) && shown.some((p) => !p.is_mine);

  return (
    <>
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-xl border border-navy-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-navy-600 focus:outline-none"
            />
          </div>
          {view !== "messages" && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Trier"
              className="shrink-0 rounded-xl border border-navy-200 bg-white px-2.5 py-2 text-xs font-bold text-navy-600 focus:border-navy-600 focus:outline-none"
            >
              <option value="priority">Priorité</option>
              <option value="name">A → Z</option>
              <option value="discipline-asc">Discipline ↑</option>
              <option value="discipline-desc">Discipline ↓</option>
            </select>
          )}
        </div>

        {/* les vues : la colonne de droite change, la liste ne bouge pas */}
        <div className="flex gap-0.5 rounded-xl bg-white p-1 shadow-soft">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={`relative flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 text-[11px] font-bold transition-colors ${
                view === v.key ? "bg-navy-800 text-white" : "text-navy-500 hover:text-navy-900"
              }`}
            >
              {v.icon}
              <span className="truncate">{v.label}</span>
              {v.key === "messages" && unreadCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-navy-400">
          Aucun joueur ne correspond à « {query} ».
        </p>
      ) : (
        <div>
          {shown.map((p, i) => {
            const name = `${p.first_name} ${p.last_name}`.trim();
            const startsGroup = hasBothGroups && (i === 0 || shown[i - 1].is_mine !== p.is_mine);
            const isMessages = view === "messages";
            // en vue Messages, la seule pilule de la ligne est la pastille de
            // non-lu : la dispo redescend en texte sous le nom
            const title = isMessages ? (
              <span className="truncate">{name}</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="truncate">{name}</span>
                {p.availability !== "available" && (
                  <Badge tone={p.availability === "injured" ? "danger" : "neutral"}>
                    {AVAILABILITY_LABELS[p.availability]}
                  </Badge>
                )}
              </span>
            );

            // le fil qui attend, sinon le plus récent : la ligne mène droit à
            // la bonne conversation dans la fiche
            const href = isMessages
              ? `/coach/joueurs/${p.id}?onglet=messages&canal=${channelKey(
                  p.inbox?.channelAdminId ?? null
                )}`
              : `/coach/joueurs/${p.id}`;

            const menu = (
              <RowMenu playerId={p.id} playerName={name} availability={p.availability} />
            );

            return (
              <div key={p.id}>
                {startsGroup && (
                  <p className="pb-2 pt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-navy-400 first:pt-1">
                    {p.is_mine ? "Mes joueurs" : "Autres joueurs du club"}
                  </p>
                )}
                <Row
                  href={href}
                  airy={isMessages}
                  boxed
                  // l'avatar tient la colonne de gauche ; hors vue Messages,
                  // c'est lui qui porte la pastille de non-lu (en vue Messages,
                  // la pastille à icône, à droite, suffit)
                  leading={
                    <PlayerAvatar
                      firstName={p.first_name}
                      lastName={p.last_name}
                      alert={!isMessages && p.has_unread_messages}
                    />
                  }
                  emphasis={p.has_unread_messages}
                  title={title}
                  subtitle={
                    isMessages ? <PlayerSignals player={p} /> : <Subtitle player={p} view={view} />
                  }
                  right={
                    isMessages ? (
                      <>
                        {p.has_unread_messages && (
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                            title="Message non lu"
                          >
                            <MessageCircle size={13} strokeWidth={2.5} />
                            <span className="sr-only">Message non lu</span>
                          </span>
                        )}
                        {p.inbox?.lastAt && (
                          <span
                            className={`text-[11px] tabular-nums ${
                              p.has_unread_messages ? "font-bold text-danger" : "text-navy-400"
                            }`}
                          >
                            {formatAgoFr(p.inbox.lastAt)}
                          </span>
                        )}
                        {menu}
                      </>
                    ) : (
                      <>
                        <Primary player={p} view={view} />
                        <PlayerWhatsAppLink whatsappNumber={p.whatsapp_number} playerName={name} />
                        {menu}
                      </>
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Un signal de la ligne : icône + valeur, gris par défaut, coloré seulement
 * s'il alerte. C'est du texte, pas une pilule — la règle « une pilule par
 * ligne » reste tenue.
 */
function Signal({
  icon,
  children,
  tone = "muted",
  title,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "muted" | "plain" | "danger" | "warning";
  title: string;
}) {
  const color =
    tone === "danger"
      ? "font-bold text-danger"
      : tone === "warning"
        ? "font-bold text-warning"
        : tone === "plain"
          ? "font-semibold text-navy-600"
          : "text-navy-400";
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${color}`} title={title}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Ce qu'un coach veut savoir avant d'ouvrir un fil : la dispo si elle n'est
 * pas « disponible », la discipline, la semaine (fait/prévu), le dernier
 * check-in énergie/douleur, puis l'offre. Chaque signal est muet tant qu'il
 * n'y a rien à dire (pas de check-in → rien), et ne prend de la couleur que
 * quand il alerte : la ligne reste calme, l'œil va droit au rouge.
 */
function PlayerSignals({ player: p }: { player: PlayerListItem }) {
  const items: React.ReactNode[] = [];

  if (p.availability !== "available") {
    items.push(
      <Signal
        key="dispo"
        tone={p.availability === "injured" ? "danger" : "warning"}
        title="Disponibilité"
      >
        {AVAILABILITY_LABELS[p.availability]}
      </Signal>
    );
  }

  if (p.discipline !== null) {
    const low = p.discipline < LOW_DISCIPLINE_THRESHOLD;
    items.push(
      <Signal
        key="discipline"
        icon={<Activity size={11} />}
        tone={low ? "danger" : "plain"}
        title="Discipline"
      >
        {formatPercent(p.discipline)}
      </Signal>
    );
  }

  if (p.week && p.week.planned > 0) {
    items.push(
      <Signal key="semaine" icon={<CalendarCheck size={11} />} tone="plain" title="Semaine">
        {p.week.done}/{p.week.planned}
      </Signal>
    );
  }

  if (p.energy) {
    items.push(
      <Signal
        key="energie"
        icon={<Zap size={11} />}
        tone={p.energy.score <= 4 ? "warning" : "plain"}
        title="Énergie (dernier check-in)"
      >
        {p.energy.score}
      </Signal>
    );
  }

  if (p.pain && p.pain.score > 0) {
    items.push(
      <Signal
        key="douleur"
        icon={<HeartPulse size={11} />}
        tone={p.pain.score >= 5 ? "danger" : "plain"}
        title="Douleur (dernier check-in)"
      >
        {p.pain.score}
      </Signal>
    );
  }

  items.push(
    <Signal key="offre" title="Offre">
      {OFFER_LABELS[p.offer]}
    </Signal>
  );

  return (
    <span className="inline-flex items-center gap-x-2 text-[11px]">
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
      <span className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
        {p.energy && (
          <span className={p.energy.score <= 4 ? "text-warning" : "text-navy-700"}>
            <Zap size={11} className="-mt-0.5 mr-0.5 inline" />
            {p.energy.score}
          </span>
        )}
        {p.pain && (
          <span className={p.pain.score >= 5 ? "text-danger" : "text-navy-700"}>
            <HeartPulse size={11} className="-mt-0.5 mr-0.5 inline" />
            {p.pain.score}
          </span>
        )}
      </span>
    );
  }
  const w = p.week;
  if (!w || w.planned === 0) return <span className="text-xs text-navy-300">—</span>;
  const complete = w.done >= w.planned;
  return (
    <span
      className={`text-sm font-extrabold tabular-nums ${complete ? "text-success" : "text-navy-900"}`}
    >
      {w.done}/{w.planned}
    </span>
  );
}

/** La ligne secondaire, selon la vue. Le message en attente passe toujours en premier, en rouge. */
function Subtitle({ player: p, view }: { player: PlayerListItem; view: View }) {
  const parts: string[] = [];

  if (view === "discipline") {
    parts.push(OFFER_LABELS[p.offer]);
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
        <span className="font-bold text-danger">Message en attente{parts.length > 0 && " · "}</span>
      )}
      {parts.join(" · ")}
    </>
  );
}
