"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkEvent } from "@/app/actions/planning";
import { toggleHabitCheck } from "@/app/actions/habits";
import { EVENT_TYPE_LABELS, formatDuration } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { successFeedback, tapFeedback } from "@/lib/feedback";
import { CheckIcon, XIcon } from "@/components/icons";
import { HabitIcon } from "@/components/habits/HabitIcon";
import { EditorialTabs } from "@/components/editorial/EditorialTabs";
import { Overline } from "@/components/editorial/primitives";
import { SquareIconButton } from "@/components/editorial/primitives";
import { EventDetailModal } from "./EventDetailModal";
import { EventTypeIcon } from "./EventIcon";
import type {
  CompletionStatus,
  EventCompletion,
  HabitColor,
  PlannedEvent,
} from "@/lib/types";

export interface DayHabit {
  id: string;
  name: string;
  icon: string;
  color: HabitColor;
  checkedToday: boolean;
}

interface Props {
  events: PlannedEvent[];
  completions: EventCompletion[];
  habits: DayHabit[];
  weekStart: string;
  today: string;
  /** remonte les pointages d'événements + si la journée est bouclée (célébrations) */
  onEventChecked?: (eventId: string, status: CompletionStatus, dayComplete: boolean) => void;
}

/**
 * Liste unifiée des actions du jour : événements du planning + habitudes,
 * filtrée par onglets « À faire » / « Fait » (langage Éditorial Sport).
 */
export function DayActionList({
  events,
  completions,
  habits,
  weekStart,
  today,
  onEventChecked,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [detailEvent, setDetailEvent] = useState<PlannedEvent | null>(null);

  // UI optimiste : le pointage bascule instantanément (aucune attente serveur,
  // aucun bouton gelé). Les props fraîches du router.refresh() reprennent la
  // main une fois l'action terminée ; en cas d'échec, l'état revient tout seul.
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
  const [optHabits, applyHabit] = useOptimistic(
    habits,
    (curr: DayHabit[], id: string) =>
      curr.map((h) => (h.id === id ? { ...h, checkedToday: !h.checkedToday } : h))
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
      await checkEvent(event.id, weekStart, status);
      router.refresh();
    });
  }

  function toggleHabit(habit: DayHabit) {
    if (!habit.checkedToday) successFeedback();
    else tapFeedback();
    startTransition(async () => {
      applyHabit(habit.id);
      await toggleHabitCheck(habit.id, today);
      router.refresh();
    });
  }

  const eventDone = (e: PlannedEvent) => completionOf(e.id)?.status === "done";
  const eventNotDone = (e: PlannedEvent) => completionOf(e.id)?.status === "not_done";

  const todoEvents = events.filter((e) => !eventDone(e) && !eventNotDone(e));
  const doneEvents = events.filter((e) => eventDone(e) || eventNotDone(e));
  const todoHabits = optHabits.filter((h) => !h.checkedToday);
  const doneHabits = optHabits.filter((h) => h.checkedToday);
  const doneCount = events.filter(eventDone).length + doneHabits.length;
  const todoCount = todoEvents.length + todoHabits.length;

  const showEvents = tab === "todo" ? todoEvents : doneEvents;
  const showHabits = tab === "todo" ? todoHabits : doneHabits;

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

      {showEvents.length === 0 && showHabits.length === 0 ? (
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
          {showEvents.map((event) => {
            const done = eventDone(event);
            const notDone = eventNotDone(event);
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 border-b border-hair py-3"
              >
                <button
                  onClick={() => setDetailEvent(event)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="shrink-0 text-ink" aria-hidden>
                    <EventTypeIcon type={event.event_type} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`ed-value block truncate text-lg ${
                        done || notDone ? "text-muted line-through" : "text-ink"
                      }`}
                    >
                      {EVENT_TYPE_LABELS[event.event_type]}
                    </span>
                    <span className="ed-meta block text-[9px] text-meta">
                      {formatTime(event.event_time)} · {formatDuration(event.duration_minutes)}
                      {notDone && " · pas fait"}
                    </span>
                  </span>
                </button>
                {tab === "todo" ? (
                  /* À faire : les deux choix, fait ou pas fait */
                  <div className="flex shrink-0 gap-1.5">
                    <SquareIconButton
                      onClick={() => checkEventAction(event, "done")}
                      aria-label="Fait"
                      filled
                      className="transition-transform active:scale-90"
                    >
                      <CheckIcon size={18} />
                    </SquareIconButton>
                    <SquareIconButton
                      onClick={() => checkEventAction(event, "not_done")}
                      aria-label="Pas fait"
                      className="transition-transform active:scale-90"
                    >
                      <XIcon size={18} />
                    </SquareIconButton>
                  </div>
                ) : (
                  /* Fait : état affiché + un seul bouton de correction (l'opposé),
                     pas de ✓ redondant. Corriger vers « pas fait » ne fait que
                     rendre la stat plus honnête, jamais l'inverse. */
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className={`ed-meta text-[10px] ${done ? "text-meta" : "text-orange"}`}>
                      {done ? "Fait" : "Pas fait"}
                    </span>
                    {done ? (
                      <SquareIconButton
                        onClick={() => checkEventAction(event, "not_done")}
                        aria-label="Corriger : marquer pas fait"
                        title="Pas fait finalement ?"
                        className="transition-transform active:scale-90"
                      >
                        <XIcon size={18} />
                      </SquareIconButton>
                    ) : (
                      <SquareIconButton
                        onClick={() => checkEventAction(event, "done")}
                        aria-label="Corriger : marquer fait"
                        title="Fait finalement ?"
                        filled
                        className="transition-transform active:scale-90"
                      >
                        <CheckIcon size={18} />
                      </SquareIconButton>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Section habitudes : l'engagement personnel du joueur */}
          {showHabits.length > 0 && (
            <div className="mt-5 mb-2 flex items-center justify-between">
              <Overline>Mes habitudes</Overline>
              <Link
                href="/dashboard?section=habitudes"
                className="ed-meta text-[10px] text-orange underline-offset-2 hover:underline"
              >
                Gérer →
              </Link>
            </div>
          )}
          {showHabits.map((habit) => (
            <div key={habit.id} className="flex items-center gap-3 border-b border-hair py-3">
              <span className="shrink-0 text-ink" aria-hidden>
                <HabitIcon name={habit.icon} size={17} color="currentColor" />
              </span>
              <span
                className={`ed-value min-w-0 flex-1 truncate text-lg ${
                  habit.checkedToday ? "text-muted line-through" : "text-ink"
                }`}
              >
                {habit.name}
              </span>
              <SquareIconButton
                onClick={() => toggleHabit(habit)}
                aria-label={habit.checkedToday ? "Décocher" : "Fait"}
                filled={habit.checkedToday}
                className="transition-transform active:scale-90"
              >
                <CheckIcon size={17} />
              </SquareIconButton>
            </div>
          ))}
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
