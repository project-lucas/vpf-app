"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getConversationMessages, getUnreadChannels } from "@/app/actions/messages";
import { MessageThread } from "./MessageThread";
import type { ConversationMessageWithSender } from "@/lib/types";

/** Rythme de rafraîchissement des pastilles — calé sur celui du fil ouvert. */
const UNREAD_REFRESH_MS = 30_000;

export interface ChannelTab {
  /** clé stable de l'onglet (cf. channelKey) */
  key: string;
  /** null = fil coach & parents ; sinon fil privé de cet admin */
  adminId: string | null;
  label: string;
  hasUnread: boolean;
}

/**
 * Fil d'un joueur avec ses canaux (migration 0034) : un onglet par canal, une
 * pastille rouge sur ceux qui portent un message non lu, et le fil du canal
 * actif en dessous.
 *
 * Un seul onglet (offre perf, coach référent, parent) : la barre disparaît et
 * l'écran redevient exactement celui d'avant.
 *
 * Seul le canal ouvert au chargement est rendu par le serveur ; changer
 * d'onglet va chercher son historique. On ne garde pas de cache : revenir sur
 * un onglet doit montrer l'état réel du fil, pas ce qu'on y avait laissé.
 */
export function ConversationPanel({
  playerId,
  currentUserId,
  channels,
  initialChannelKey,
  initialMessages,
  variant,
  className,
}: {
  playerId: string;
  currentUserId: string;
  channels: ChannelTab[];
  /** canal rendu par le serveur (défaut : le premier) */
  initialChannelKey?: string;
  initialMessages: ConversationMessageWithSender[];
  variant: "editorial" | "coach";
  className?: string;
}) {
  const firstKey = initialChannelKey ?? channels[0]?.key ?? "";
  const [activeKey, setActiveKey] = useState(firstKey);
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [unread, setUnread] = useState(
    () => new Set(channels.filter((c) => c.hasUnread && c.key !== firstKey).map((c) => c.key))
  );

  // dernière demande d'onglet : une réponse en retard ne doit pas écraser le
  // fil qu'on regarde maintenant
  const requestRef = useRef(activeKey);

  const active = channels.find((c) => c.key === activeKey) ?? channels[0];
  const ed = variant === "editorial";

  const openChannel = useCallback(
    (tab: ChannelTab) => {
      setUnread((current) => {
        if (!current.has(tab.key)) return current;
        const next = new Set(current);
        next.delete(tab.key);
        return next;
      });
      if (tab.key === activeKey) return;

      setActiveKey(tab.key);
      setIsLoading(true);
      requestRef.current = tab.key;
      void getConversationMessages(playerId, tab.adminId).then((fresh) => {
        if (requestRef.current !== tab.key) return;
        setMessages(fresh);
        setIsLoading(false);
      });
    },
    [activeKey, playerId]
  );

  // Pastilles : le fil ouvert se marque lu tout seul, on ne surveille donc que
  // les autres canaux. Même cadence que le fil, plus un passage au retour sur
  // l'onglet du navigateur.
  useEffect(() => {
    if (channels.length < 2) return;
    const adminIds = channels.map((c) => c.adminId);

    const check = async () => {
      const keys = await getUnreadChannels(playerId, adminIds);
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
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {channels.length > 1 && (
        // au doigt : bande qui défile bord à bord ; à la souris : retour à la
        // ligne, sinon les derniers onglets deviennent inatteignables
        <div
          role="tablist"
          aria-label="Conversations"
          className="scrollbar-none -mx-1 mb-3 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1 pointer-fine:mx-0 pointer-fine:flex-wrap pointer-fine:overflow-x-visible pointer-fine:px-0"
        >
          {channels.map((tab) => {
            const isActive = tab.key === activeKey;
            const hasDot = unread.has(tab.key);
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => openChannel(tab)}
                className={
                  ed
                    ? `ed-meta relative shrink-0 rounded-md border-2 px-3 py-1.5 text-[10px] transition-colors ${
                        isActive
                          ? "border-ink bg-ink text-paper"
                          : "border-ink/15 bg-card text-meta hover:border-ink hover:text-ink"
                      }`
                    : `relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? "bg-navy-800 text-white"
                          : "border border-navy-200 bg-white text-navy-500"
                      }`
                }
              >
                {tab.label}
                {hasDot && (
                  <>
                    <span
                      aria-hidden
                      className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ${
                        ed ? "border-2 border-paper bg-orange" : "border-2 border-white bg-danger"
                      }`}
                    />
                    <span className="sr-only"> — nouveaux messages</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <p
          className={`flex-1 py-8 text-center text-sm ${ed ? "text-meta" : "text-navy-400"}`}
        >
          Chargement de la conversation…
        </p>
      ) : (
        // key : changer de canal repart d'un fil propre (défilement, brouillon)
        <MessageThread
          key={activeKey}
          playerId={playerId}
          currentUserId={currentUserId}
          channelAdminId={active?.adminId ?? null}
          initialMessages={messages}
          variant={variant}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
