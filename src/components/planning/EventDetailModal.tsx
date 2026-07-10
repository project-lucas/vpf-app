"use client";

import Link from "next/link";
import { Clock, Dumbbell, MessageCircle } from "lucide-react";
import {
  EVENT_TYPE_DETAILS,
  eventLabel,
  formatDuration,
  WEEKDAY_LABELS,
} from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { Modal } from "@/components/ui/Modal";
import { EventIconBadge } from "./EventIcon";
import type { EventCompletion, PlannedEvent } from "@/lib/types";

/** Vue détail d'un événement du planning : description, durée, exercices, commentaire. */
export function EventDetailModal({
  event,
  completion,
  open,
  onClose,
}: {
  event: PlannedEvent;
  completion?: EventCompletion;
  open: boolean;
  onClose: () => void;
}) {
  // ?? autre : un type ajouté en base avant le déploiement du client ne doit pas faire crasher la fiche
  const details = EVENT_TYPE_DETAILS[event.event_type] ?? EVENT_TYPE_DETAILS.autre;
  const withSessions = event.event_type === "training_basket" || event.event_type === "prep_physique";

  return (
    <Modal open={open} onClose={onClose} variant="retro">
      <div className="flex items-center gap-3">
        <EventIconBadge type={event.event_type} event={event} />
        <div className="min-w-0 flex-1">
          <h2 className="ed-value text-xl text-ink">{eventLabel(event)}</h2>
          <p className="ed-meta text-[10px] text-meta">
            {WEEKDAY_LABELS[event.weekday - 1]} · {formatTime(event.event_time)}
          </p>
        </div>
        {completion && (
          <span
            className={`ed-meta shrink-0 rounded-md px-2 py-1 text-[10px] ${
              completion.status === "done"
                ? "bg-ink text-paper"
                : "border-2 border-orange text-orange"
            }`}
          >
            {completion.status === "done" ? "Fait" : "Pas fait"}
          </span>
        )}
      </div>

      <p className="mt-4 font-body text-sm leading-relaxed text-ink">{details.description}</p>

      <p className="ed-meta mt-3 flex items-center gap-1.5 text-[11px] text-meta">
        <Clock size={13} /> {formatDuration(event.duration_minutes)}
        <span className="text-muted">· conseillé : {details.duration}</span>
      </p>

      <div className="mt-4">
        <p className="ed-overline mb-2 flex items-center gap-1.5">
          <Dumbbell size={12} /> Pour une session réussie
        </p>
        <ul className="space-y-1.5">
          {details.exercises.map((ex) => (
            <li key={ex} className="flex items-start gap-2 font-body text-sm text-ink">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
              {ex}
            </li>
          ))}
        </ul>
      </div>

      {withSessions && (
        <Link
          href="/seances"
          className="ed-value mt-4 block rounded-md border-2 border-ink bg-card px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-ink/5"
        >
          Voir mes séances assignées →
        </Link>
      )}

      {completion?.comment && (
        <p className="mt-4 flex items-start gap-1.5 border-t border-hair pt-3 font-body text-xs text-meta">
          <MessageCircle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{completion.comment}</span>
        </p>
      )}
    </Modal>
  );
}
