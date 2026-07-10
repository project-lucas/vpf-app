"use client";

import { useOptimistic, useState, useTransition } from "react";
import { checkEvent } from "@/app/actions/planning";
import { eventLabel, formatDuration, habitPale } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { successFeedback, tapFeedback } from "@/lib/feedback";
import { CheckIcon, XIcon } from "@/components/icons";
import { EditorialTabs } from "@/components/editorial/EditorialTabs";
import { Overline } from "@/components/editorial/primitives";
import { SquareIconButton } from "@/components/editorial/primitives";
import { EventDetailModal } from "./EventDetailModal";
import { EventTypeIcon, eventColorHex } from "./EventIcon";
import type { CompletionStatus, EventCompletion, PlannedEvent } from "@/lib/types";

interface Props {
  events: PlannedEvent[];
  completions: EventCompletion[];
  weekStart: string;
  /** remonte les pointages d'événements + si la journée est bouclée (célébrations) */
  onEventChecked?: (eventId: string, status: CompletionStatus, dayComplete: boolean) => void;
}

/**
 * Liste des actions du jour — les tâches du planning, filtrées par onglets
 * « À faire » / « Fait » (langage Éditorial Sport). Les envies personnelles
 * passent par une activité perso de la semaine type, pas par une liste à part.
 */
export function DayActionList({ events, completions, weekStart, onEventChecked }: Props) {
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [detailEvent, setDetailEvent] = useState<PlannedEvent | null>(null);

  // UI optimiste : le pointage bascule instantanément (aucune attente serveur,
  // aucun bouton gelé). Les props fraîches du revalidatePath de l'action
  // reprennent la main une fois l'action terminée ; en cas d'échec, l'état
  // revient tout seul.
  const [optCompletions, applyCompletion] = useOptimistic(
    completions,
    (curr: EventCompletion[], u: { eventId: string; status: CompletionStatus }) => {
      const existing = curr.find((c) => c.planned_event_id === u.eventId);
      const others = curr.filter((c) => c.planned_event_id !== u.eventId);
      return [
        ...others,
        { ...(existing ?? { planned_event_id: u.eventId }), status: u.status } as EventCompletion,
      ];
    }
  );
  const completionOf = (eventId: string) =>
    optCompletions.find((c) => c.planned_event_id === eventId);

  function checkEventAction(event: PlannedEvent, status: "done" | "not_done") {
    const wasDone = completionOf(event.id)?.status === "done";
    if (status === "done" && !wasDone) {
      successFeedback();
      // journée bouclée ? On le calcule sur l'état optimiste (instantané), pas
      // sur les props serveur qui arrivent en retard — sinon la célébration se
      // rate quand on valide vite plusieurs tâches d'affilée.
      const dayComplete = events.every(
        (e) => e.id === event.id || completionOf(e.id)?.status === "done"
      );
      onEventChecked?.(event.id, status, dayComplete);
    } else {
      tapFeedback();
    }
    startTransition(async () => {
      applyCompletion({ eventId: event.id, status });
      // le revalidatePath de l'action renvoie la page fraîche dans la même
      // réponse — pas de router.refresh() (ce serait un 2e rendu complet)
      await checkEvent(event.id, weekStart, status);
    });
  }

  const eventDone = (e: PlannedEvent) => completionOf(e.id)?.status === "done";

  // Système binaire : « Fait » = fait (rayé) ; « À faire » = tout le reste
  // (jamais pointé OU remis en « à faire » via la croix). Cocher fait monter le
  // % du jour, annuler le fait redescendre.
  const todoEvents = events.filter((e) => !eventDone(e));
  const doneEvents = events.filter((e) => eventDone(e));
  const doneCount = doneEvents.length;
  const todoCount = todoEvents.length;

  const showEvents = tab === "todo" ? todoEvents : doneEvents;

  return (
    <div>
      <EditorialTabs
        className="mb-5"
        active={tab}
        onChange={(k) => setTab(k as "todo" | "done")}
        tabs={[
          { key: "todo", label: "À faire", count: todoCount },
          { key: "done", label: "Fait", count: doneCount },
        ]}
      />

      {showEvents.length === 0 ? (
        <div className="py-8 text-center">
          <p className="ed-display text-[32px] text-ink">
            {tab === "todo" ? "Tout est fait" : "Rien de validé"}
          </p>
          <p className="ed-meta mt-2 text-[10px] text-meta">
            {tab === "todo"
              ? "Rien ne traîne — solide."
              : "À toi de jouer — coche ta première action."}
          </p>
        </div>
      ) : (
        <div>
          {/* Section planning : le cadre d'entraînement */}
          {showEvents.length > 0 && <Overline className="mb-2">Mon planning</Overline>}
          {showEvents.map((event, i) => {
            const done = eventDone(event);
            const hex = eventColorHex(event);
            return (
              <div
                key={event.id}
                className={`mb-2 flex items-center gap-3 rounded-md px-3 py-3 ${
                  done ? "" : "task-breathe"
                }`}
                style={
                  {
                    backgroundColor: habitPale(hex, done ? "future" : "bg"),
                    borderLeft: `6px solid ${done ? `${hex}66` : hex}`,
                    "--task-glow": `${hex}59`,
                    animationDelay: `${i * 0.3}s`,
                  } as React.CSSProperties
                }
              >
                <button
                  onClick={() => setDetailEvent(event)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={`shrink-0 ${done ? "" : "task-icon-pulse"}`}
                    aria-hidden
                    style={{
                      color: done ? `${hex}88` : hex,
                      animationDelay: `${i * 0.3}s`,
                    }}
                  >
                    <EventTypeIcon type={event.event_type} event={event} size={18} colored={!done} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`ed-value block truncate text-lg ${
                        done ? "text-muted line-through" : "text-ink"
                      }`}
                    >
                      {eventLabel(event)}
                    </span>
                    <span className="ed-meta block text-[9px] text-meta">
                      {formatTime(event.event_time)} · {formatDuration(event.duration_minutes)}
                    </span>
                  </span>
                </button>
                {done ? (
                  /* Fait : rayé, la croix le renvoie en « À faire » */
                  <SquareIconButton
                    onClick={() => checkEventAction(event, "not_done")}
                    aria-label="Annuler : remettre à faire"
                    title="Remettre à faire"
                    className="transition-transform active:scale-90"
                  >
                    <XIcon size={18} />
                  </SquareIconButton>
                ) : (
                  /* À faire : la coche le marque fait (il se raye et passe à droite) */
                  <SquareIconButton
                    onClick={() => checkEventAction(event, "done")}
                    aria-label="Marquer fait"
                    filled
                    className="transition-transform active:scale-90"
                  >
                    <CheckIcon size={18} />
                  </SquareIconButton>
                )}
              </div>
            );
          })}

        </div>
      )}

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          completion={completionOf(detailEvent.id)}
          open
          onClose={() => setDetailEvent(null)}
        />
      )}
    </div>
  );
}
