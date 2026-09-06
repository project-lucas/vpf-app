"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, Search, Users } from "lucide-react";
import {
  discardMessageAttachment,
  markConversationRead,
  sendConversationMessage,
} from "@/app/actions/messages";
import { MessageComposer } from "@/components/messages/MessageComposer";
import { Row } from "@/components/ui/Row";
import { STAFF_CHANNEL_KEY } from "@/lib/constants";
import { formatAgoFr } from "@/lib/dates";
import type { InboxThread } from "@/lib/conversations";
import type { MessageAttachmentInput } from "@/lib/types";

type Filter = "all" | "unread";

/** Ce que la boîte sait d'un fil après y avoir répondu sans le quitter. */
interface LocalUpdate {
  hasUnread: boolean;
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
}

function keyOf(t: InboxThread): string {
  return `${t.playerId}:${t.channelAdminId ?? STAFF_CHANNEL_KEY}`;
}

/**
 * La liste de la boîte de réception, avec ce qui fait gagner les clics :
 *
 *  * **Répondre depuis la liste.** Une ligne s'ouvre sur place — dernier
 *    message en clair, zone de réponse complète (texte, pièce jointe, vocal),
 *    lien vers la conversation entière. Traiter cinq messages = cinq réponses,
 *    zéro navigation. Ouvrir une ligne vaut lecture : la pastille s'éteint.
 *  * **Filtre « Non lus »** et recherche par nom : le fil qu'on cherche sans
 *    défiler.
 *
 * Les fils muets (jamais écrits) restent repliés en bas : ils n'ont rien à
 * dire, ils ne doivent rien pousser hors de l'écran.
 */
export function InboxList({
  threads,
  relayAdminId,
}: {
  threads: InboxThread[];
  relayAdminId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Map<string, LocalUpdate>>(new Map());

  const merged = useMemo(
    () => threads.map((t) => ({ ...t, ...(updates.get(keyOf(t)) ?? {}) })),
    [threads, updates]
  );
  const unreadCount = merged.filter((t) => t.hasUnread).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter(
      (t) =>
        (filter === "all" || t.hasUnread) && (!q || t.playerName.toLowerCase().includes(q))
    );
  }, [merged, filter, query]);

  const active = shown.filter((t) => t.lastAt);
  const silent = shown.filter((t) => !t.lastAt);

  function patch(key: string, update: Partial<LocalUpdate>) {
    setUpdates((current) => {
      const next = new Map(current);
      const base = merged.find((t) => keyOf(t) === key);
      next.set(key, {
        hasUnread: base?.hasUnread ?? false,
        lastBody: base?.lastBody ?? null,
        lastAt: base?.lastAt ?? null,
        lastFromMe: base?.lastFromMe ?? false,
        ...(current.get(key) ?? {}),
        ...update,
      });
      return next;
    });
  }

  function toggle(t: InboxThread) {
    const key = keyOf(t);
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    // ouvrir la ligne, c'est lire le fil : la pastille s'éteint tout de suite,
    // et le marqueur suit côté serveur
    if (t.hasUnread) {
      patch(key, { hasUnread: false });
      void markConversationRead(t.playerId, t.channelAdminId);
    }
  }

  async function reply(
    t: InboxThread,
    body: string,
    attachment: MessageAttachmentInput | null
  ) {
    const result = await sendConversationMessage(t.playerId, body, t.channelAdminId, attachment);
    if (!result.ok) return result;
    patch(keyOf(t), {
      hasUnread: false,
      lastBody: body || "Pièce jointe",
      lastAt: new Date().toISOString(),
      lastFromMe: true,
    });
    setOpenKey(null);
    return { ok: true as const };
  }

  return (
    <div>
      {/* ---- Filtre + recherche ---- */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex shrink-0 gap-1 rounded-xl bg-navy-100 p-0.5">
          {(
            [
              { key: "all", label: "Tous" },
              { key: "unread", label: `Non lus${unreadCount ? ` · ${unreadCount}` : ""}` },
            ] as { key: Filter; label: string }[]
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === f.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
      </div>

      {/* ---- Fils animés ---- */}
      {active.length === 0 ? (
        <p className="py-6 text-center text-sm text-navy-400">
          {filter === "unread" ? "Rien en attente — tout est lu." : "Personne n'a encore écrit."}
        </p>
      ) : (
        <div>
          {active.map((t) => {
            const key = keyOf(t);
            const isOpen = openKey === key;
            const isPrivate = t.channelAdminId !== null;
            return (
              <Row
                key={key}
                onClick={() => toggle(t)}
                dot={t.hasUnread}
                emphasis={t.hasUnread}
                title={
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{t.playerName}</span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        isPrivate ? "bg-navy-800 text-white" : "text-navy-400 ring-1 ring-inset ring-navy-200"
                      }`}
                    >
                      {isPrivate ? <Lock size={9} /> : <Users size={9} />}
                      {isPrivate ? "Privé" : "Global"}
                    </span>
                  </span>
                }
                subtitle={
                  t.lastBody
                    ? `${t.lastFromMe ? "Vous : " : ""}${t.lastBody}`
                    : "Aucun message pour le moment"
                }
                right={
                  t.lastAt && (
                    <span
                      className={`text-[11px] tabular-nums ${
                        t.hasUnread ? "font-bold text-danger" : "text-navy-400"
                      }`}
                    >
                      {formatAgoFr(t.lastAt)}
                    </span>
                  )
                }
                className={isOpen ? "bg-navy-50/60 -mx-1 rounded-lg px-1" : ""}
              >
                {isOpen && (
                  <QuickReply
                    thread={t}
                    relayAdminId={relayAdminId}
                    onSend={(body, attachment) => reply(t, body, attachment)}
                  />
                )}
              </Row>
            );
          })}
        </div>
      )}

      {/* ---- Fils muets ---- */}
      {silent.length > 0 && filter === "all" && (
        <details className="mt-3 border-t border-navy-100 pt-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-navy-400">
            {silent.length} fil{silent.length > 1 ? "s" : ""} sans message
          </summary>
          <div className="mt-2">
            {silent.map((t) => {
              const key = keyOf(t);
              const isOpen = openKey === key;
              return (
                <Row
                  key={key}
                  onClick={() => toggle(t)}
                  title={t.playerName}
                  subtitle={t.channelAdminId ? "Fil privé — jamais écrit" : "Fil global — jamais écrit"}
                >
                  {isOpen && (
                    <QuickReply
                      thread={t}
                      relayAdminId={relayAdminId}
                      onSend={(body, attachment) => reply(t, body, attachment)}
                    />
                  )}
                </Row>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Le dépliage d'une ligne : la zone de réponse et le lien vers la conversation
 * entière. Le dernier message est déjà lisible sur la ligne ; ici on répond.
 */
function QuickReply({
  thread,
  relayAdminId,
  onSend,
}: {
  thread: InboxThread;
  relayAdminId: string | null;
  onSend: (
    body: string,
    attachment: MessageAttachmentInput | null
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const params = new URLSearchParams({
    joueur: thread.playerId,
    canal: thread.channelAdminId ?? STAFF_CHANNEL_KEY,
  });
  if (relayAdminId) params.set("fil", relayAdminId);

  return (
    <div className="pb-3 pl-5">
      <MessageComposer
        playerId={thread.playerId}
        variant="coach"
        disabled={false}
        onSend={onSend}
        onDiscardAttachment={(path) => void discardMessageAttachment(path)}
      />
      <Link
        href={`/coach/messages?${params.toString()}`}
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-navy-500 hover:text-navy-900"
      >
        Ouvrir la conversation <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
