"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, Dumbbell, HeartHandshake, Search, Target, UserRound, Users } from "lucide-react";
import { getConversationMessages, getUnreadChannels } from "@/app/actions/messages";
import { MessageThread } from "./MessageThread";
import type { ConversationChannel, ConversationMessageWithSender } from "@/lib/types";

/** Rythme de rafraîchissement des pastilles — calé sur celui du fil ouvert. */
const UNREAD_REFRESH_MS = 30_000;

/** L'avatar d'un fil : une icône et une couleur par rôle, comme une photo de groupe. */
const CHANNEL_LOOK: Record<ConversationChannel["kind"], { icon: React.ReactNode; bg: string }> = {
  global: { icon: <Users size={20} />, bg: "#0f2a4a" },
  referent: { icon: <UserRound size={20} />, bg: "#e2622d" },
  technique: { icon: <Target size={20} />, bg: "#2a6fb0" },
  physique: { icon: <Dumbbell size={20} />, bg: "#b4232c" },
  parents: { icon: <HeartHandshake size={20} />, bg: "#1f7a4d" },
  legacy: { icon: <Archive size={20} />, bg: "#8696a0" },
};

function ChannelAvatar({ kind, size = 44 }: { kind: ConversationChannel["kind"]; size?: number }) {
  const look = CHANNEL_LOOK[kind];
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, backgroundColor: look.bg }}
    >
      {look.icon}
    </span>
  );
}

/** « 14:32 » aujourd'hui, « Hier », sinon « 13/10 ». */
function listTime(iso: string): string {
  const fmt = (d: Date) => d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const day = fmt(new Date(iso));
  if (day === fmt(new Date())) {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  }
  if (day === fmt(new Date(Date.now() - 86_400_000))) return "Hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
}

/**
 * La messagerie d'un joueur, façon WhatsApp (0048) : à gauche la liste des
 * discussions (Global, Référent, Technique, Physique, Parents — selon ce que
 * le lecteur a le droit de voir), à droite la discussion ouverte. Sur un écran
 * étroit, l'une puis l'autre, avec la flèche de retour.
 *
 * Seule la discussion ouverte au chargement est rendue par le serveur ; en
 * changer va chercher son historique.
 */
export function ConversationPanel({
  playerId,
  currentUserId,
  channels,
  initialChannelKey = "global",
  startInChat = false,
  initialMessages,
  className,
}: {
  playerId: string;
  currentUserId: string;
  channels: ConversationChannel[];
  /** discussion dont le serveur a chargé `initialMessages` (défaut : Global) */
  initialChannelKey?: string;
  /** téléphone : ouvrir directement la discussion (lien `?canal=`) plutôt que la liste */
  startInChat?: boolean;
  initialMessages: ConversationMessageWithSender[];
  variant?: "editorial" | "coach";
  className?: string;
}) {
  const known = channels.some((c) => c.id === initialChannelKey);
  const firstId = known ? initialChannelKey : (channels[0]?.id ?? "global");
  const [activeId, setActiveId] = useState(firstId);
  // téléphone : on montre la liste d'abord, sauf si un lien vise une discussion
  const [showChat, setShowChat] = useState(startInChat && known);
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [unread, setUnread] = useState(
    () => new Set(channels.filter((c) => c.hasUnread && c.id !== firstId).map((c) => c.id))
  );
  // dernière demande : une réponse en retard n'écrase pas la discussion ouverte
  const requestRef = useRef(activeId);
  const active = channels.find((c) => c.id === activeId) ?? channels[0];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const needle = query.trim().toLowerCase();
  // les discussions non lues d'abord (en haut, comme WhatsApp met en avant ce qui
  // attend), puis l'ordre du serveur : la plus récente en tête
  const shown = channels
    .filter(
      (c) =>
        (filter === "all" || unread.has(c.id)) &&
        (!needle || c.label.toLowerCase().includes(needle) || (c.last?.body ?? "").toLowerCase().includes(needle))
    )
    .sort((a, b) => Number(unread.has(b.id)) - Number(unread.has(a.id)));

  const open = useCallback(
    (channel: ConversationChannel) => {
      setShowChat(true);
      setUnread((current) => {
        if (!current.has(channel.id)) return current;
        const next = new Set(current);
        next.delete(channel.id);
        return next;
      });
      if (channel.id === activeId) return;
      setActiveId(channel.id);
      setIsLoading(true);
      requestRef.current = channel.id;
      void getConversationMessages(playerId, channel.id).then((fresh) => {
        if (requestRef.current !== channel.id) return;
        setMessages(fresh);
        setIsLoading(false);
      });
    },
    [activeId, playerId]
  );

  // À l'ouverture, sans fil demandé par un lien : on va droit au premier fil non
  // lu (le serveur a chargé Global ; s'il n'attend rien, on bascule une fois).
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || startInChat) return;
    autoOpened.current = true;
    const current = channels.find((c) => c.id === activeId);
    const waiting = channels.find((c) => c.hasUnread);
    if (waiting && !current?.hasUnread) open(waiting);
    else if (current?.hasUnread) setShowChat(true);
  }, [channels, activeId, startInChat, open]);

  // Pastilles : la discussion ouverte se marque lue toute seule, on surveille les autres.
  useEffect(() => {
    if (channels.length < 2) return;
    const ids = channels.map((c) => c.id);
    const check = async () => {
      const keys = await getUnreadChannels(playerId, ids);
      setUnread(new Set(keys.filter((k) => k !== requestRef.current)));
    };
    const id = setInterval(() => void check(), UNREAD_REFRESH_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [channels, playerId]);

  return (
    <div
      className={`@container flex min-h-0 overflow-hidden rounded-xl border border-[#e9edef] bg-white ${className ?? ""}`}
    >
      {/* ---- la liste des discussions (colonne étroite, comme WhatsApp Web) ---- */}
      <nav
        aria-label="Discussions"
        className={`min-h-0 w-full shrink-0 flex-col border-r border-[#e9edef] bg-white @lg:flex @lg:w-[38%] @lg:min-w-[230px] @lg:max-w-[340px] ${
          showChat ? "hidden" : "flex"
        }`}
      >
        <div className="shrink-0 px-3 pb-2 pt-3">
          <p className="px-1 text-[20px] font-bold text-[#111b21]">Discussions</p>
          <label className="mt-2 flex items-center gap-2 rounded-full bg-[#f0f2f5] px-3 py-1.5 text-[#54656f]">
            <Search size={15} aria-hidden />
            <input
              id={`wa-search-${playerId}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              aria-label="Rechercher une discussion"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#111b21] placeholder:text-[#667781] focus:outline-none"
            />
          </label>
          <div className="mt-2 flex gap-1.5">
            {(
              [
                { key: "all", label: "Toutes" },
                { key: "unread", label: `Non lues${unread.size > 0 ? ` ${unread.size}` : ""}` },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                  filter === f.key ? "bg-[#d9fdd3] text-[#008069]" : "bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {shown.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-[#667781]">
              {filter === "unread" ? "Aucune discussion non lue." : "Aucune discussion trouvée."}
            </li>
          )}
          {shown.map((c) => {
            const isActive = c.id === activeId;
            const hasDot = unread.has(c.id);
            const preview = c.last
              ? `${c.last.fromMe ? "Toi : " : c.last.fromName ? `${c.last.fromName} : ` : ""}${c.last.body}`
              : c.members;
            return (
              <li key={c.id} className="px-1.5">
                <button
                  type="button"
                  onClick={() => open(c)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[#f5f6f6] ${
                    isActive ? "@lg:bg-[#f0f2f5]" : ""
                  }`}
                >
                  <ChannelAvatar kind={c.kind} size={46} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15.5px] text-[#111b21] ${hasDot ? "font-bold" : "font-normal"}`}>
                        {c.label}
                      </span>
                      {c.last && (
                        <span className={`shrink-0 text-[12px] ${hasDot ? "font-semibold text-[#25d366]" : "text-[#667781]"}`}>
                          {listTime(c.last.at)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${hasDot ? "text-[#111b21]" : "text-[#667781]"}`}>
                        {preview}
                      </span>
                      {hasDot && (
                        <span className="h-[18px] min-w-[18px] shrink-0 rounded-full bg-[#25d366] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                          •<span className="sr-only">nouveaux messages</span>
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ---- la discussion ouverte ---- */}
      <section
        aria-label={active?.label ?? "Discussion"}
        className={`min-h-0 min-w-0 flex-1 flex-col @lg:flex ${showChat ? "flex" : "hidden"}`}
      >
        {active && (
          <header className="flex shrink-0 items-center gap-3 border-b border-[#e9edef] bg-white px-3 py-2">
            <button
              type="button"
              onClick={() => setShowChat(false)}
              aria-label="Retour aux discussions"
              className="-ml-1 rounded-full p-1.5 text-[#54656f] hover:bg-black/5 @lg:hidden"
            >
              <ArrowLeft size={20} />
            </button>
            <ChannelAvatar kind={active.kind} size={40} />
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-medium text-[#111b21]">{active.label}</span>
              <span className="block truncate text-[12.5px] text-[#667781]">{active.members}</span>
            </span>
          </header>
        )}
        {isLoading ? (
          <p className="wa-wallpaper flex flex-1 items-center justify-center text-[13px] text-[#667781]">
            Chargement…
          </p>
        ) : (
          // key : changer de discussion repart d'un fil propre (défilement, brouillon)
          <MessageThread
            key={activeId}
            playerId={playerId}
            currentUserId={currentUserId}
            channel={activeId}
            canWrite={active?.canWrite ?? true}
            initialMessages={messages}
            variant="coach"
            className="min-h-0 flex-1"
          />
        )}
      </section>
    </div>
  );
}
