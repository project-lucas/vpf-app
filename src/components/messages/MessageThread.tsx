"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";
import {
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from "@/app/actions/messages";
import { formatAgoFr } from "@/lib/dates";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import type { ConversationMessageWithSender, UserRole } from "@/lib/types";

const REFRESH_INTERVAL_MS = 30_000;

/** Étiquette de rôle affichée sous le nom de l'expéditeur (rien pour le joueur). */
function roleLabel(role: UserRole | null): string {
  if (role === "coach") return "Coach";
  if (role === "admin") return "Staff VPF";
  if (role === "parent") return "Parent";
  return "";
}

/**
 * Fil de discussion d'un joueur : historique + zone d'envoi. Utilisé par le
 * joueur (variant "editorial", scope .ed) et par le staff dans la fiche joueur
 * (variant "coach", style navy). Rafraîchi toutes les 30 s et au retour sur
 * l'onglet — pas de temps réel, un push prévient déjà les absents.
 */
export function MessageThread({
  playerId,
  currentUserId,
  initialMessages,
  variant,
}: {
  playerId: string;
  currentUserId: string;
  initialMessages: ConversationMessageWithSender[];
  variant: "editorial" | "coach";
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(initialMessages.length);

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

  // toujours coller le fil en bas quand un message arrive ou part
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await sendConversationMessage(playerId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      await refresh();
    });
  }

  const ed = variant === "editorial";

  const bubbleOwn = ed
    ? "bg-ink text-paper"
    : "bg-navy-800 text-white";
  const bubbleOther = ed
    ? "border-2 border-ink/15 bg-card text-ink"
    : "bg-navy-50 text-navy-800";
  const metaColor = ed ? "text-meta" : "text-navy-400";

  return (
    <div className="flex flex-col">
      <div
        ref={scrollRef}
        className={`max-h-[420px] min-h-[160px] space-y-3 overflow-y-auto pr-1 ${
          ed ? "" : "rounded-xl"
        }`}
      >
        {messages.length === 0 ? (
          <p className={`py-8 text-center text-sm ${metaColor}`}>
            Aucun message pour le moment. Lance la conversation !
          </p>
        ) : (
          messages.map((m) => {
            const own = m.sender_id === currentUserId;
            const label = roleLabel(m.sender_role);
            return (
              <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${own ? "text-right" : "text-left"}`}>
                  {!own && (
                    <p className={`mb-0.5 text-[11px] font-semibold ${metaColor}`}>
                      {m.sender_name}
                      {label && (
                        <span className={ed ? "text-orange" : "text-navy-500"}> · {label}</span>
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
                  <p className={`mt-0.5 text-[10px] ${metaColor}`}>{formatAgoFr(m.created_at)}</p>
                </div>
              </div>
            );
          })
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

      <div className={`mt-3 flex items-end gap-2 ${ed ? "border-t-2 border-ink pt-3" : "border-t border-navy-100 pt-3"}`}>
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
