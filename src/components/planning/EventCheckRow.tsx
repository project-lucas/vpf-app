"use client";

import { useOptimistic, useState, useTransition } from "react";
import { checkEvent, setCompletionComment } from "@/app/actions/planning";
import { successFeedback, tapFeedback } from "@/lib/feedback";
import { EVENT_TYPE_LABELS, formatDuration } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { CheckIcon, XIcon } from "@/components/icons";
import { XpBurst } from "@/components/ui/XpBurst";
import { XP_VALUES } from "@/lib/gamification";
import { SquareIconButton } from "@/components/editorial/primitives";
import { EventDetailModal } from "./EventDetailModal";
import { EventTypeIcon } from "./EventIcon";
import type { CompletionStatus, EventCompletion, PlannedEvent } from "@/lib/types";

interface Props {
  event: PlannedEvent;
  completion?: EventCompletion;
  weekStart: string;
  canCheck: boolean;
  onChecked?: (eventId: string, status: CompletionStatus) => void;
}

export function EventCheckRow({ event, completion, weekStart, canCheck, onChecked }: Props) {
  const [, startTransition] = useTransition();
  const [commentOpen, setCommentOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [comment, setComment] = useState(completion?.comment ?? "");
  const [xpBurst, setXpBurst] = useState(0);

  // Statut optimiste : le bouton se remplit instantanément, sans attendre le
  // serveur ni geler les autres lignes ; les props fraîches reprennent la main.
  const [optStatus, setOptStatus] = useOptimistic<
    CompletionStatus | undefined,
    CompletionStatus
  >(completion?.status, (_, next) => next);

  function check(newStatus: "done" | "not_done") {
    const wasDone = optStatus === "done";
    if (newStatus === "done" && !wasDone) {
      successFeedback();
      setXpBurst((b) => b + 1);
    } else {
      tapFeedback();
    }
    onChecked?.(event.id, newStatus);
    startTransition(async () => {
      setOptStatus(newStatus);
      // le revalidatePath de l'action rafraîchit la page dans la même réponse
      await checkEvent(event.id, weekStart, newStatus);
    });
  }

  function saveComment() {
    if (!completion) return;
    startTransition(async () => {
      await setCompletionComment(completion.id, comment);
      setCommentOpen(false);
    });
  }

  const status = optStatus;

  return (
    <div className="border-b border-hair py-3">
      <div className="flex items-center gap-3">
        {/* zone info tappable : ouvre la fiche détail de l'événement */}
        <button
          onClick={() => setDetailOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="shrink-0 text-ink" aria-hidden>
            <EventTypeIcon type={event.event_type} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="ed-value block truncate text-lg text-ink">
              {EVENT_TYPE_LABELS[event.event_type]}
            </span>
            <span className="ed-meta block text-[9px] text-meta">
              {formatTime(event.event_time)} · {formatDuration(event.duration_minutes)}
            </span>
          </span>
        </button>
        {canCheck && (
          <div className="relative flex shrink-0 gap-1.5">
            <XpBurst amount={XP_VALUES.eventDone} burstKey={xpBurst} />
            <SquareIconButton
              onClick={() => check("done")}
              aria-label="Fait"
              filled={status === "done"}
              className="transition-transform active:scale-90"
            >
              <CheckIcon size={18} />
            </SquareIconButton>
            <SquareIconButton
              onClick={() => check("not_done")}
              aria-label="Pas fait"
              className={`transition-transform active:scale-90 ${
                status === "not_done" ? "bg-orange text-paper" : ""
              }`}
            >
              <XIcon size={18} />
            </SquareIconButton>
          </div>
        )}
      </div>

      {completion && (
        <div className="mt-2.5 border-t border-hair pt-2.5">
          {commentOpen ? (
            <div className="space-y-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Un commentaire sur cet événement ? (optionnel)"
                className="w-full border-2 border-ink bg-transparent px-3 py-2 font-body text-sm text-ink outline-none focus-visible:outline-none"
                rows={2}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setCommentOpen(false)}
                  className="ed-meta text-[10px] text-meta"
                >
                  Annuler
                </button>
                <button onClick={saveComment} className="ed-meta text-[10px] text-orange">
                  Enregistrer
                </button>
              </div>
            </div>
          ) : completion.comment ? (
            <button
              onClick={() => setCommentOpen(true)}
              className="w-full text-left font-body text-xs text-meta"
            >
              {completion.comment}
            </button>
          ) : (
            <button
              onClick={() => setCommentOpen(true)}
              className="ed-meta text-[10px] text-muted hover:text-ink"
            >
              + Ajouter un commentaire
            </button>
          )}
        </div>
      )}

      <EventDetailModal
        event={event}
        completion={completion}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
