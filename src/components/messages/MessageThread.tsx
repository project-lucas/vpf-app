"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import {
  deleteConversationMessage,
  discardMessageAttachment,
  editConversationMessage,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from "@/app/actions/messages";
import { createClient } from "@/lib/supabase/client";
import { CONVERSATION_PAGE_SIZE } from "@/lib/constants";
import type { ConversationMessageWithSender, MessageAttachmentInput } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";

/**
 * Filet de sécurité : le temps réel (0036) porte les messages à la seconde,
 * mais un réseau qui bloque les WebSockets ne doit pas geler la conversation.
 */
const REFRESH_INTERVAL_MS = 30_000;

/** Marge sous laquelle on considère le fil « collé en bas ». */
const STICK_THRESHOLD_PX = 80;

/**
 * Durée pendant laquelle on réutilise l'URL signée déjà reçue pour une pièce
 * jointe, largement sous MESSAGE_SIGNED_URL_TTL_SECONDS (4 h) — l'URL gardée ne
 * périme donc jamais à l'écran.
 *
 * Sans ça, chaque rafraîchissement du fil (30 s, ou un événement temps réel)
 * refabrique une signature différente pour le MÊME fichier : le navigateur voit
 * une autre URL, son cache ne sert à rien et il retélécharge toutes les photos
 * visibles. Un fil ouvert avec trois photos brûlait ainsi une centaine de Mo à
 * l'heure — de forfait mobile côté joueur, et de quota Supabase côté club.
 */
const SIGNED_URL_REUSE_MS = 60 * 60 * 1000;

/** URL signée déjà adoptée pour un message, et depuis quand. */
type SignedUrlCache = Map<string, { url: string; at: number }>;

/**
 * Garde l'URL signée déjà servie pour chaque pièce jointe, tant qu'elle est
 * jeune. Le reste du message (texte modifié, suppression) est bien celui qui
 * vient d'arriver : seule l'adresse du fichier est figée.
 */
function keepSignedUrls(
  fresh: ConversationMessageWithSender[],
  cache: SignedUrlCache
): ConversationMessageWithSender[] {
  const now = Date.now();
  return fresh.map((m) => {
    if (!m.attachment_url) return m;
    const kept = cache.get(m.id);
    if (kept && now - kept.at < SIGNED_URL_REUSE_MS) {
      return { ...m, attachment_url: kept.url };
    }
    cache.set(m.id, { url: m.attachment_url, at: now });
    return m;
  });
}

function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
}

/**
 * Un canal du fil d'un joueur : historique + zone d'envoi. Utilisé par le
 * joueur (variant "editorial", scope .ed) et par le staff dans la fiche joueur
 * (variant "coach", style navy).
 *
 * `channelAdminId` : null = fil coach & parents, sinon fil privé de cet admin.
 * Le composant est monté avec une `key` par canal (cf. ConversationPanel) —
 * changer d'onglet repart donc d'un état propre.
 *
 * Le fil ne grandit JAMAIS avec l'historique : hauteur fixe (donnée par
 * `className`), zone de saisie toujours visible en bas, et seuls les
 * CONVERSATION_PAGE_SIZE derniers messages sont montés — les plus anciens se
 * déplient à la demande. À l'ouverture comme à l'arrivée d'un message on colle
 * en bas, sauf si l'utilisateur est en train de relire plus haut (une pastille
 * l'avertit alors du nouveau message).
 */
export function MessageThread({
  playerId,
  currentUserId,
  initialMessages,
  variant,
  channelAdminId = null,
  className = "h-[460px]",
}: {
  playerId: string;
  currentUserId: string;
  initialMessages: ConversationMessageWithSender[];
  variant: "editorial" | "coach";
  /** null = fil coach & parents ; sinon fil privé de cet admin (0034) */
  channelAdminId?: string | null;
  /** Hauteur du bloc (toujours bornée) — ex. "h-[60dvh]", "h-full". */
  className?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [visibleCount, setVisibleCount] = useState(CONVERSATION_PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // amorcé avec ce que le serveur a déjà signé : le premier rafraîchissement ne
  // doit pas retélécharger les photos affichées à l'ouverture
  const signedUrlsRef = useRef<SignedUrlCache>(
    new Map(
      initialMessages
        .filter((m) => m.attachment_url)
        .map((m) => [m.id, { url: m.attachment_url as string, at: Date.now() }])
    )
  );
  const lastCountRef = useRef(initialMessages.length);
  // l'utilisateur lit-il le bas du fil ? sinon on ne lui vole pas son défilement
  const stickToBottomRef = useRef(true);
  // hauteur à préserver quand on déplie l'historique vers le haut
  const restoreOffsetRef = useRef<number | null>(null);

  const visible = messages.slice(-visibleCount);
  const hasOlder = messages.length > visible.length;
  const lastMessageId = messages[messages.length - 1]?.id;

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await getConversationMessages(playerId, channelAdminId);
    setMessages(keepSignedUrls(fresh, signedUrlsRef.current));
    // de nouveaux messages sont arrivés pendant que le fil était ouvert :
    // ils sont lus à l'écran, on avance le marqueur
    if (fresh.length > lastCountRef.current) {
      lastCountRef.current = fresh.length;
      await markConversationRead(playerId, channelAdminId);
    }
  }, [playerId, channelAdminId]);

  // ouverture du canal = lecture de tout son historique
  useEffect(() => {
    void markConversationRead(playerId, channelAdminId);
  }, [playerId, channelAdminId]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Temps réel (0036) : le fil réagit à la seconde. On ne consomme pas la
  // charge utile de l'événement — elle ne porte ni le nom de l'auteur ni l'URL
  // signée de la pièce jointe. Elle sert de signal, la lecture reste sous RLS.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`fil-${playerId}-${channelAdminId ?? "staff"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
          filter: `player_id=eq.${playerId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [playerId, channelAdminId, refresh]);

  /**
   * Ouvrir un fil, c'est arriver sur le DERNIER message — jamais avoir à
   * descendre soi-même.
   *
   * Poser `scrollTop` une seule fois au montage ne suffit pas : dans la fiche
   * joueur, les onglets montent tous leurs contenus et masquent les inactifs
   * (`display: none`), donc le fil naît avec une hauteur nulle et le calage se
   * perd. Même chose quand une police, une photo ou une vidéo arrive après coup
   * et rallonge l'historique.
   *
   * Un ResizeObserver recale à chaque fois que la boîte ou son contenu change
   * de taille — tant que l'utilisateur lit le bas. S'il est remonté dans
   * l'historique, on ne lui vole rien.
   */
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const stick = () => {
      // dépliage de l'historique : le calage est géré plus bas, pas ici
      if (!stickToBottomRef.current || restoreOffsetRef.current !== null) return;
      scroller.scrollTop = scroller.scrollHeight;
    };

    stick();
    const observer = new ResizeObserver(stick);
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Un message est arrivé (ou le fil vient de s'ouvrir) : on colle en bas si
  // l'utilisateur y était, sinon on signale sans bouger sa lecture.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !lastMessageId) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setHasNewBelow(false);
    } else {
      setHasNewBelow(true);
    }
  }, [lastMessageId]);

  // « Voir les messages précédents » : on garde l'œil sur le même message en
  // rattrapant la hauteur ajoutée au-dessus.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const keep = restoreOffsetRef.current;
    if (el && keep !== null) {
      el.scrollTop = el.scrollHeight - keep;
      restoreOffsetRef.current = null;
    }
  }, [visibleCount]);

  function showOlder() {
    const el = scrollRef.current;
    restoreOffsetRef.current = el ? el.scrollHeight - el.scrollTop : null;
    setVisibleCount((c) => c + CONVERSATION_PAGE_SIZE);
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = isNearBottom(el);
    if (stickToBottomRef.current) setHasNewBelow(false);
  }

  async function send(body: string, attachment: MessageAttachmentInput | null) {
    setError(null);
    // envoyer, c'est revenir au bas du fil
    stickToBottomRef.current = true;
    const result = await sendConversationMessage(playerId, body, channelAdminId, attachment);
    if (!result.ok) return result;

    // le message envoyé doit rester visible même si on relisait l'historique
    setVisibleCount((c) => Math.max(c, CONVERSATION_PAGE_SIZE));
    await refresh();
    return { ok: true as const };
  }

  async function edit(messageId: string, body: string) {
    setError(null);
    setIsBusy(true);
    const result = await editConversationMessage(messageId, body);
    setIsBusy(false);
    if (result.ok) await refresh();
    return result;
  }

  async function remove(messageId: string) {
    setError(null);
    setIsBusy(true);
    const result = await deleteConversationMessage(messageId);
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessages((current) => current.filter((m) => m.id !== messageId));
    lastCountRef.current = Math.max(0, lastCountRef.current - 1);
    await refresh();
  }

  const ed = variant === "editorial";
  const metaColor = ed ? "text-meta" : "text-navy-400";

  return (
    // hauteur bornée + min-h-0 : le fil défile dans sa boîte, la zone de saisie
    // reste ancrée en bas et la page, elle, ne s'allonge pas d'un pixel
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`h-full overflow-y-auto pr-1 ${ed ? "" : "rounded-xl"}`}
        >
          {/* enveloppe mesurée par le ResizeObserver : c'est sa hauteur qui dit
              quand l'historique a fini de se dessiner */}
          <div ref={contentRef} className="space-y-3">
            {messages.length === 0 ? (
              <p className={`py-8 text-center text-sm ${metaColor}`}>
                Aucun message pour le moment. Lance la conversation !
              </p>
            ) : (
              <>
                {hasOlder && (
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={showOlder}
                      className={
                        ed
                          ? "ed-meta rounded-md border-2 border-ink/15 px-3 py-1.5 text-[10px] text-meta transition-colors hover:border-ink hover:text-ink"
                          : "rounded-full bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-500 transition-colors hover:bg-navy-100"
                      }
                    >
                      Voir les messages précédents
                    </button>
                  </div>
                )}

                {visible.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    own={m.sender_id === currentUserId}
                    variant={variant}
                    disabled={isBusy}
                    onEdit={edit}
                    onDelete={(id) => void remove(id)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* pastille de rattrapage : visible seulement si on lit plus haut */}
        {hasNewBelow && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={
              ed
                ? "ed-meta absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-3 py-1.5 text-[10px] text-ink shadow-lg"
                : "absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
            }
          >
            <ArrowDown size={13} />
            Nouveau message
          </button>
        )}
      </div>

      {error && (
        <p
          className={
            ed
              ? "ed-meta mt-2 text-[11px] text-orange"
              : "mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"
          }
        >
          {error}
        </p>
      )}

      <MessageComposer
        playerId={playerId}
        variant={variant}
        disabled={isBusy}
        onSend={send}
        onDiscardAttachment={(path) => void discardMessageAttachment(path)}
      />
    </div>
  );
}
