"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { ArrowDown, SendHorizontal, Trash2 } from "lucide-react";
import {
  deleteConversationMessage,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from "@/app/actions/messages";
import { formatAgoFr } from "@/lib/dates";
import { CONVERSATION_PAGE_SIZE, MESSAGE_MAX_LENGTH } from "@/lib/constants";
import type { ConversationMessageWithSender, UserRole } from "@/lib/types";

const REFRESH_INTERVAL_MS = 30_000;

/** Marge sous laquelle on considère le fil « collé en bas ». */
const STICK_THRESHOLD_PX = 80;

/** Étiquette de rôle affichée sous le nom de l'expéditeur (rien pour le joueur). */
function roleLabel(role: UserRole | null): string {
  if (role === "coach") return "Coach";
  if (role === "admin") return "Staff VPF";
  if (role === "parent") return "Parent";
  return "";
}

function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
}

/**
 * Fil de discussion d'un joueur : historique + zone d'envoi. Utilisé par le
 * joueur (variant "editorial", scope .ed) et par le staff dans la fiche joueur
 * (variant "coach", style navy). Rafraîchi toutes les 30 s et au retour sur
 * l'onglet — pas de temps réel, un push prévient déjà les absents.
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
  className = "h-[460px]",
}: {
  playerId: string;
  currentUserId: string;
  initialMessages: ConversationMessageWithSender[];
  variant: "editorial" | "coach";
  /** Hauteur du bloc (toujours bornée) — ex. "h-[60dvh]", "h-full". */
  className?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [visibleCount, setVisibleCount] = useState(CONVERSATION_PAGE_SIZE);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isPending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
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
    const fresh = await getConversationMessages(playerId);
    setMessages(fresh);
    // de nouveaux messages sont arrivés pendant que le fil était ouvert :
    // ils sont lus à l'écran, on avance le marqueur
    if (fresh.length > lastCountRef.current) {
      lastCountRef.current = fresh.length;
      await markConversationRead(playerId);
    }
  }, [playerId]);

  // ouverture du fil = lecture de tout l'historique
  useEffect(() => {
    void markConversationRead(playerId);
  }, [playerId]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

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

  function send() {
    const body = draft.trim();
    if (!body || isPending) return;
    setError(null);
    // envoyer, c'est revenir au bas du fil
    stickToBottomRef.current = true;
    startTransition(async () => {
      const result = await sendConversationMessage(playerId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      // le message envoyé doit rester visible même si on relisait l'historique
      setVisibleCount((c) => Math.max(c, CONVERSATION_PAGE_SIZE));
      await refresh();
    });
  }

  function remove(messageId: string) {
    setError(null);
    setConfirmDeleteId(null);
    startTransition(async () => {
      const result = await deleteConversationMessage(messageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== messageId));
      lastCountRef.current = Math.max(0, lastCountRef.current - 1);
      await refresh();
    });
  }

  const ed = variant === "editorial";

  const bubbleOwn = ed ? "bg-ink text-paper" : "bg-navy-800 text-white";
  const bubbleOther = ed
    ? "border-2 border-ink/15 bg-card text-ink"
    : "bg-navy-50 text-navy-800";
  const metaColor = ed ? "text-meta" : "text-navy-400";
  const dangerColor = ed ? "text-orange" : "text-danger";

  return (
    // hauteur bornée + min-h-0 : le fil défile dans sa boîte, la zone de saisie
    // reste ancrée en bas et la page, elle, ne s'allonge pas d'un pixel
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`h-full space-y-3 overflow-y-auto pr-1 ${ed ? "" : "rounded-xl"}`}
        >
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

              {visible.map((m) => {
                const own = m.sender_id === currentUserId;
                const label = roleLabel(m.sender_role);
                const confirming = confirmDeleteId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-1.5 ${
                      own ? "justify-end" : "justify-start"
                    }`}
                  >
                    {/* suppression : uniquement ses propres messages (la RLS
                        refuse le reste), à gauche de la bulle */}
                    {own &&
                      (confirming ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => remove(m.id)}
                            disabled={isPending}
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${dangerColor} disabled:opacity-40`}
                          >
                            Supprimer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            aria-label="Annuler la suppression"
                            className={`rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${metaColor}`}
                          >
                            Non
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(m.id)}
                          aria-label="Supprimer mon message"
                          className={`shrink-0 rounded-md p-1.5 opacity-50 transition-opacity hover:opacity-100 ${metaColor}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      ))}

                    <div className={`max-w-[85%] ${own ? "text-right" : "text-left"}`}>
                      {!own && (
                        <p className={`mb-0.5 text-[11px] font-semibold ${metaColor}`}>
                          {m.sender_name}
                          {label && (
                            <span className={ed ? "text-orange" : "text-navy-500"}>
                              {" "}
                              · {label}
                            </span>
                          )}
                        </p>
                      )}
                      <div
                        className={`inline-block rounded-lg px-3.5 py-2.5 text-left text-sm leading-relaxed ${
                          own ? bubbleOwn : bubbleOther
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                      <p className={`mt-0.5 text-[10px] ${metaColor}`}>
                        {formatAgoFr(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
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

      <div
        className={`mt-3 flex shrink-0 items-end gap-2 ${
          ed ? "border-t-2 border-ink pt-3" : "border-t border-navy-100 pt-3"
        }`}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
          onKeyDown={(e) => {
            // Entrée = envoi (Maj+Entrée = retour à la ligne), comme partout
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Écris ton message…"
          rows={2}
          className={
            ed
              ? "ed-field w-full flex-1 resize-none"
              : "w-full flex-1 resize-none rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
          }
        />
        <button
          type="button"
          onClick={send}
          disabled={isPending || !draft.trim()}
          aria-label="Envoyer le message"
          className={
            ed
              ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-ink text-paper transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          }
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
