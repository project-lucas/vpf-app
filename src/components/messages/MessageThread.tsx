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
 * `channel` : le fil ouvert (global, technique, physique, referent, parents, legacy:<id>).
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
  channel = "global",
  canWrite = true,
  className = "h-[460px]",
}: {
  playerId: string;
  currentUserId: string;
  initialMessages: ConversationMessageWithSender[];
  variant: "editorial" | "coach";
  /** fil ouvert (cf. src/lib/channels.ts) */
  channel?: string;
  /** false : archive en lecture seule, pas de zone de saisie */
  canWrite?: boolean;
  /** Hauteur du bloc (toujours bornée) — ex. "h-[60dvh]", "h-full". */
  className?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [visibleCount, setVisibleCount] = useState(CONVERSATION_PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  // Le fil est-il réellement sous les yeux ? (cf. le bloc « lecture » plus bas)
  const [onScreen, setOnScreen] = useState(false);
  const [docVisible, setDocVisible] = useState(true);
  const isVisible = onScreen && docVisible;

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

  // `isVisible` sans le mettre en dépendance de `refresh` : le sondage et
  // l'abonnement temps réel ne doivent pas se relancer à chaque aller-retour
  // d'onglet, seul le marquage « lu » dépend de la visibilité.
  const visibleRef = useRef(false);
  useEffect(() => {
    visibleRef.current = isVisible;
  }, [isVisible]);

  const refresh = useCallback(async () => {
    const fresh = await getConversationMessages(playerId, channel);
    setMessages(keepSignedUrls(fresh, signedUrlsRef.current));
    // de nouveaux messages sont arrivés pendant que le fil était ouvert : ils
    // ne sont lus que si le fil est VRAIMENT à l'écran (onglet de la fiche
    // ouvert, onglet du navigateur au premier plan)
    if (fresh.length > lastCountRef.current) {
      lastCountRef.current = fresh.length;
      if (visibleRef.current) await markConversationRead(playerId, channel);
    }
  }, [playerId, channel]);

  /**
   * Le fil est-il réellement sous les yeux ?
   *
   * `Tabs` monte TOUS ses contenus et masque les inactifs en `display: none`
   * (c'est aussi ce qui oblige le ResizeObserver plus bas). Marquer lu au
   * montage éteignait donc la pastille d'un message jamais ouvert : il suffisait
   * d'arriver sur la fiche par l'onglet Semaine — ce que fait précisément le
   * lien d'une alerte « planning vide ».
   *
   * L'IntersectionObserver règle les deux cas d'un coup : un ancêtre en
   * `display: none` n'intersecte rien, et l'entrée repasse à `true` au moment
   * où l'onglet devient actif. `visibilitychange` couvre l'onglet de navigateur
   * laissé en arrière-plan, que le sondage 30 s consommait silencieusement.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((e) => e.isIntersecting)),
      { threshold: 0 }
    );
    observer.observe(el);

    const onVisibility = () => setDocVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ouvrir un canal (et le regarder) = lecture de tout son historique
  useEffect(() => {
    if (!isVisible) return;
    void markConversationRead(playerId, channel);
  }, [playerId, channel, isVisible]);

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
    const sub = supabase
      .channel(`fil-${playerId}-${channel}`)
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
      void supabase.removeChannel(sub);
    };
  }, [playerId, channel, refresh]);

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
    const result = await sendConversationMessage(playerId, body, channel, attachment);
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

  // Rendu WhatsApp pour tout le monde (0048) : le variant ne joue plus sur le fil
  void variant;

  return (
    // hauteur bornée + min-h-0 : le fil défile dans sa boîte, la zone de saisie
    // reste ancrée en bas et la page, elle, ne s'allonge pas d'un pixel
    <div className={`flex min-h-0 flex-col bg-[#efeae2] ${className}`}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="wa-wallpaper h-full overflow-y-auto py-2"
        >
          {/* enveloppe mesurée par le ResizeObserver : c'est sa hauteur qui dit
              quand l'historique a fini de se dessiner */}
          <div ref={contentRef} className="space-y-1">
            {messages.length === 0 ? (
              <p className="mx-auto mt-6 w-fit max-w-[85%] rounded-lg bg-[#ffeecd] px-3 py-2 text-center text-[12.5px] text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                {canWrite ? "Aucun message pour le moment. Écris le premier !" : "Ce fil est vide."}
              </p>
            ) : (
              <>
                {hasOlder && (
                  <div className="pb-1 text-center">
                    <button
                      type="button"
                      onClick={showOlder}
                      className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] hover:bg-[#f5f6f6]"
                    >
                      Voir les messages précédents
                    </button>
                  </div>
                )}

                {visible.map((m, i) => {
                  const prev = visible[i - 1];
                  const day = dayLabel(m.created_at);
                  const newDay = !prev || dayLabel(prev.created_at) !== day;
                  // même auteur à la suite, même jour : pas de prénom, bulles serrées
                  const sameAuthor = !newDay && prev?.sender_id === m.sender_id && prev?.is_system === m.is_system;
                  return (
                    <div key={m.id} className={sameAuthor ? "" : "pt-1.5"}>
                      {newDay && (
                        <div className="sticky top-1 z-[1] my-2 flex justify-center">
                          <span className="rounded-lg bg-white/95 px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                            {day}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={m}
                        own={m.sender_id === currentUserId}
                        showName={!sameAuthor}
                        disabled={isBusy}
                        onEdit={edit}
                        onDelete={(id) => void remove(id)}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* pastille de rattrapage : visible seulement si on lit plus haut */}
        {hasNewBelow && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Aller au dernier message"
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#54656f] shadow-[0_2px_6px_rgba(11,20,26,0.25)]"
          >
            <ArrowDown size={18} />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#25d366]" />
          </button>
        )}
      </div>

      {error && (
        <p className="bg-[#f0f2f5] px-3 pt-2 text-[12.5px] font-semibold text-[#ea0038]">{error}</p>
      )}

      {canWrite ? (
        <MessageComposer
          playerId={playerId}
          variant="coach"
          disabled={isBusy}
          onSend={send}
          onDiscardAttachment={(path) => void discardMessageAttachment(path)}
        />
      ) : (
        <p className="shrink-0 bg-[#f0f2f5] px-4 py-3 text-center text-[13px] text-[#667781]">
          Archive en lecture seule : écris dans un fil actif.
        </p>
      )}
    </div>
  );
}

/** « Aujourd'hui », « Hier », « lundi 13 octobre », en heure de Paris. */
function dayLabel(iso: string): string {
  const fmt = (d: Date) => d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const day = fmt(new Date(iso));
  const today = fmt(new Date());
  const yesterday = fmt(new Date(Date.now() - 86_400_000));
  if (day === today) return "Aujourd'hui";
  if (day === yesterday) return "Hier";
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
}
