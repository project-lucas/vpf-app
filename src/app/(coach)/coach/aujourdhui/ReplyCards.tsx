"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCheck, ClipboardList, MessageCircle, Trophy } from "lucide-react";
import {
  approveDraftsInBulk,
  approveMatchDraft,
  dismissDraft,
  replyToWaitingMessage,
  skipWaitingMessage,
} from "@/app/actions/jarvis-queue";
import { Button } from "@/components/ui/Button";
import { formatAgoFr } from "@/lib/dates";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import { Actions, Done, DraftEditor, JarvisNote, Part, PlayerLine, useDecision } from "./QueueCards";
import type { QueueDebrief, QueueMatch, QueueMessage, QueueThreadLine } from "./types";

/**
 * Les cartes de la file qui RÉPONDENT à ce que la famille vient d'écrire :
 * un message qui attend, une feuille de match. Plus le debrief du lundi et
 * la barre « Tout valider ».
 */

const FROM_LABEL: Record<QueueThreadLine["from"], string> = {
  player: "Joueur",
  parent: "Parent",
  staff: "Staff",
  system: "VPF",
};

function ThreadPreview({ lines }: { lines: QueueThreadLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-1.5 rounded-xl bg-cream/50 px-3.5 py-3">
      {lines.map((l, i) => (
        <li key={i} className={`text-[13px] leading-relaxed ${l.from === "staff" ? "text-navy-500" : "text-navy-800"}`}>
          <span className="mr-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-navy-400">
            {FROM_LABEL[l.from]} · {formatAgoFr(l.at)}
          </span>
          <span className="whitespace-pre-line">{l.body}</span>
        </li>
      ))}
    </ul>
  );
}

export function MessageCard({ item, sent = false }: { item: QueueMessage; sent?: boolean }) {
  const [body, setBody] = useState(item.draft?.body ?? "");
  const d = useDecision();
  if (sent) return <Done p={item} text="réponse envoyée" />;
  if (d.state !== "open") {
    return <Done p={item} text={d.state === "sent" ? "réponse envoyée" : "rien à répondre"} />;
  }
  return (
    <article className="space-y-5 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PlayerLine p={item} extra={`fil ${item.channelName}${item.at ? ` · ${formatAgoFr(item.at)}` : ""}`} />
        <Link href={item.href} className="text-[12px] font-semibold text-navy-500 hover:text-navy-900 hover:underline">
          Ouvrir le fil
        </Link>
      </div>
      <Part label="Les derniers échanges">
        <ThreadPreview lines={item.lines} />
      </Part>
      {item.draft?.reason && (
        <Part label="L'avis de Jarvis">
          <JarvisNote text={item.draft.reason} />
        </Part>
      )}
      <Part label="Ta réponse">
        <div className="space-y-2.5">
          {!item.draft && (
            <p className="text-[12px] text-navy-400">
              {item.draftFailed
                ? "Jarvis n'a pas pu rédiger ce brouillon : écris la réponse toi-même."
                : "Brouillon en préparation par Jarvis — tu peux aussi répondre toi-même."}
            </p>
          )}
          <DraftEditor value={body} onChange={setBody} max={MESSAGE_MAX_LENGTH} rows={3} />
        </div>
      </Part>
      <div className="border-t border-navy-50 pt-4">
        <Actions
          pending={d.pending}
          error={d.error}
          sendLabel={item.draft ? "Valider et envoyer" : "Envoyer"}
          skipLabel="Pas besoin de répondre"
          disabled={!body.trim()}
          onSend={() =>
            d.run(
              () =>
                replyToWaitingMessage({
                  playerId: item.id,
                  channel: item.channel,
                  body,
                  draftId: item.draft?.id ?? null,
                }),
              "sent"
            )
          }
          onSkip={() =>
            item.messageId
              ? d.run(
                  () => skipWaitingMessage({ playerId: item.id, messageId: item.messageId!, channel: item.channel }),
                  "dismissed"
                )
              : undefined
          }
        />
      </div>
    </article>
  );
}

export function MatchCard({ item, sent = false }: { item: QueueMatch; sent?: boolean }) {
  const [body, setBody] = useState(item.draft.body);
  const d = useDecision();
  if (sent) return <Done p={item} text="retour envoyé" />;
  if (d.state !== "open") return <Done p={item} text={d.state === "sent" ? "retour envoyé" : "passé"} />;
  return (
    <article className="space-y-5 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      <PlayerLine p={item} extra={item.matchLabel} />
      <Part label="Sa feuille">
        <p className="flex items-center gap-2 rounded-xl bg-cream/50 px-3.5 py-2.5 text-[13.5px] font-semibold text-navy-800">
          <Trophy size={14} className="shrink-0 text-gold" />
          {item.stats}
        </p>
      </Part>
      {item.draft.reason && (
        <Part label="L'avis de Jarvis">
          <JarvisNote text={item.draft.reason} />
        </Part>
      )}
      <Part label="Ton retour">
        <DraftEditor value={body} onChange={setBody} max={MESSAGE_MAX_LENGTH} rows={3} />
      </Part>
      <div className="space-y-2 border-t border-navy-50 pt-4">
        <Actions
          pending={d.pending}
          error={d.error}
          sendLabel="Valider et envoyer"
          disabled={!body.trim()}
          onSend={() => d.run(() => approveMatchDraft(item.draft.id, body), "sent")}
          onSkip={() => d.run(() => dismissDraft(item.draft.id), "dismissed")}
        />
        <p className="text-[11.5px] text-navy-400">Part dans le fil Global : lu par le joueur et ses parents.</p>
      </div>
    </article>
  );
}

/**
 * « Tout valider » : envoie d'un coup les brouillons de Jarvis d'une section,
 * tels qu'il les a écrits (une carte corrigée à la main s'envoie à l'unité).
 * Deux temps : le bouton, puis « Envoyer les N ? ».
 */
export function BulkApprove({
  kind,
  draftIds,
  label,
  onSent,
}: {
  kind: "review_reply" | "parent_report" | "message_reply" | "match_reply";
  draftIds: string[];
  label: string;
  onSent: (ids: string[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (draftIds.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          <CheckCheck size={14} className="mr-1.5 inline" />
          Tout valider ({draftIds.length})
        </Button>
      ) : (
        <>
          <span className="text-[12.5px] font-semibold text-navy-700">
            Envoyer les {draftIds.length} {label} tels que Jarvis les a écrits ?
          </span>
          <Button
            size="sm"
            loading={pending}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await approveDraftsInBulk(kind, draftIds);
                setConfirming(false);
                if (!r.ok) return setNote(r.error);
                onSent(r.sent ?? []);
                setNote(
                  `${(r.sent ?? []).length} envoyé${(r.sent ?? []).length > 1 ? "s" : ""}${
                    r.failed ? ` · ${r.failed} refusé${r.failed > 1 ? "s" : ""}` : ""
                  }`
                );
              })
            }
          >
            Confirmer
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </>
      )}
      {note && <span className="text-[12px] font-semibold text-navy-500">{note}</span>}
    </div>
  );
}

function DebriefList({ title, lines }: { title: string; lines: QueueDebrief["matches"] }) {
  if (lines.length === 0) return null;
  return (
    <Part label={title}>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="text-[13.5px] leading-relaxed text-navy-700">
            {l.name && l.playerId ? (
              <Link href={`/coach/joueurs/${l.playerId}`} className="font-bold text-navy-900 hover:underline">
                {l.name}
              </Link>
            ) : null}
            {l.name ? " · " : ""}
            {l.text}
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** Le debrief du lundi, un bloc par groupe. */
export function DebriefPanel({ debriefs }: { debriefs: QueueDebrief[] }) {
  return (
    <div className="space-y-4">
      {debriefs.map((d) => (
        <article key={d.groupName} className="space-y-5 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[15px] font-bold text-navy-900">
            <ClipboardList size={16} className="text-accent" />
            {d.groupName}
          </p>
          <JarvisNote text={d.summary} />
          <DebriefList title="Les matchs" lines={d.matches} />
          <DebriefList title="À surveiller" lines={d.watch} />
          {d.actions.length > 0 && (
            <Part label="Cette semaine">
              <ul className="space-y-1">
                {d.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[13.5px] text-navy-800">
                    <MessageCircle size={13} className="mt-1 shrink-0 text-navy-300" />
                    {a}
                  </li>
                ))}
              </ul>
            </Part>
          )}
        </article>
      ))}
    </div>
  );
}
