"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlannedEvent, deletePlannedEvent } from "@/app/actions/planning";
import {
  DEFAULT_EVENT_MINUTES,
  DURATION_OPTIONS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  formatDuration,
  HOUR_SLOTS,
  MINUTE_SLOTS,
  WEEKDAY_LABELS,
} from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { EdButton, EdField, EdSelect } from "@/components/editorial/forms";
import { TrashIcon } from "@/components/icons";
import { EventTypeIcon } from "./EventIcon";
import type { EventType, PlannedEvent } from "@/lib/types";

/** Liste d'options de durée incluant toujours la valeur courante. */
function durationChoices(current: number): number[] {
  return Array.from(new Set([...DURATION_OPTIONS, current])).sort((a, b) => a - b);
}

/**
 * Éditeur de semaine type — utilisé par le joueur (page Planning) et par le
 * coach (fiche joueur). La RLS autorise les deux.
 */
export function PlanningEditor({
  playerId,
  events,
}: {
  playerId: string;
  events: PlannedEvent[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<EventType>("training_basket");
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(DEFAULT_EVENT_MINUTES.training_basket);
  const [error, setError] = useState("");

  const [hour, minute] = time.split(":");

  function add() {
    setError("");
    startTransition(async () => {
      const result = await addPlannedEvent(playerId, {
        event_type: eventType,
        weekday,
        event_time: time,
        duration_minutes: duration,
      });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function remove(eventId: string) {
    startTransition(async () => {
      await deletePlannedEvent(eventId, playerId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Formulaire d'ajout */}
      <div className="rounded-md border-2 border-ink bg-card p-4">
        <h3 className="ed-value mb-4 text-xl text-ink">Ajouter un événement</h3>
        <div className="space-y-4">
          <EdField label="Type">
            <EdSelect
              value={eventType}
              onChange={(e) => {
                const t = e.target.value as EventType;
                setEventType(t);
                // la durée suit le défaut du type choisi (modifiable ensuite)
                setDuration(DEFAULT_EVENT_MINUTES[t]);
              }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </EdSelect>
          </EdField>
          <EdField label="Jour">
            <EdSelect value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={i + 1} value={i + 1}>
                  {label}
                </option>
              ))}
            </EdSelect>
          </EdField>
          <EdField label="Heure">
            {/* heures à gauche, minutes à droite : deux listes courtes */}
            <div className="grid grid-cols-2 gap-2">
              <EdSelect
                aria-label="Heures"
                value={hour}
                onChange={(e) => setTime(`${e.target.value}:${minute}`)}
              >
                {(HOUR_SLOTS.includes(hour) ? HOUR_SLOTS : [hour, ...HOUR_SLOTS]).map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </EdSelect>
              <EdSelect
                aria-label="Minutes"
                value={minute}
                onChange={(e) => setTime(`${hour}:${e.target.value}`)}
              >
                {(MINUTE_SLOTS.includes(minute) ? MINUTE_SLOTS : [minute, ...MINUTE_SLOTS]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  )
                )}
              </EdSelect>
            </div>
          </EdField>
          <EdField label="Durée">
            <EdSelect value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {durationChoices(duration).map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </EdSelect>
          </EdField>
          {error && <p className="ed-meta text-[11px] text-orange">{error}</p>}
          <EdButton variant="navy" full onClick={add} disabled={isPending}>
            Ajouter
          </EdButton>
        </div>
      </div>

      {/* Semaine complète */}
      {WEEKDAY_LABELS.map((label, i) => {
        const day = i + 1;
        const dayEvents = events.filter((e) => e.weekday === day);
        return (
          <div key={day}>
            <h3 className="ed-value mb-2 text-base text-ink">{label}</h3>
            {dayEvents.length === 0 ? (
              <p className="ed-meta rounded-md border-2 border-dashed border-hair px-3 py-2 text-[10px] text-muted">
                Aucun événement
              </p>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-md border-2 border-ink bg-card px-3 py-2.5"
                  >
                    <span className="shrink-0 text-ink" aria-hidden>
                      <EventTypeIcon type={event.event_type} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="ed-value truncate text-base text-ink">
                        {EVENT_TYPE_LABELS[event.event_type]}
                      </p>
                      <p className="ed-meta text-[9px] text-meta">
                        {formatTime(event.event_time)} · {formatDuration(event.duration_minutes)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(event.id)}
                      disabled={isPending}
                      aria-label="Supprimer"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-ink text-orange transition-colors hover:bg-orange hover:text-paper disabled:opacity-40"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
