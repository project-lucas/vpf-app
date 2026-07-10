"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { addPlannedEvent, deletePlannedEvent } from "@/app/actions/planning";
import {
  DEFAULT_EVENT_MINUTES,
  DURATION_OPTIONS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  eventLabel,
  formatDuration,
  habitPale,
  HABIT_COLORS,
  HABIT_ICON_NAMES,
  HOUR_SLOTS,
  MINUTE_SLOTS,
  WEEKDAY_LABELS,
} from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { EdButton, EdField, EdInput, EdSelect } from "@/components/editorial/forms";
import { TrashIcon } from "@/components/icons";
import { HabitIcon } from "@/components/habits/HabitIcon";
import { EventTypeIcon, eventColorHex } from "./EventIcon";
import type { EventType, HabitColor, PlannedEvent } from "@/lib/types";

/** Liste d'options de durée incluant toujours la valeur courante. */
function durationChoices(current: number): number[] {
  return Array.from(new Set([...DURATION_OPTIONS, current])).sort((a, b) => a - b);
}

/** Stepper − / + : la valeur au centre, un tap par cran — zéro scroll. */
function Stepper({
  value,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  value: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onPrev}
        aria-label={prevLabel}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-ink text-ink transition-all hover:bg-ink hover:text-paper active:scale-95"
      >
        <Minus size={18} strokeWidth={2.5} />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center rounded-md border-2 border-ink bg-card px-2">
        <span className="ed-value truncate text-xl text-ink">{value}</span>
      </div>
      <button
        type="button"
        onClick={onNext}
        aria-label={nextLabel}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-ink text-ink transition-all hover:bg-ink hover:text-paper active:scale-95"
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * Éditeur de semaine type — utilisé par le joueur (page Planning) et par le
 * coach (fiche joueur). La RLS autorise les deux. Le type « Activité perso »
 * laisse le joueur nommer son activité et choisir icône + couleur ; elle est
 * ensuite suivie comme les autres dans le dashboard.
 */
export function PlanningEditor({
  playerId,
  events,
}: {
  playerId: string;
  events: PlannedEvent[];
}) {
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<EventType>("training_basket");
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(DEFAULT_EVENT_MINUTES.training_basket);
  const [customName, setCustomName] = useState("");
  const [customIcon, setCustomIcon] = useState<string>("flame");
  const [customColor, setCustomColor] = useState<HabitColor>("red");
  const [error, setError] = useState("");

  const [hour, minute] = time.split(":");
  const isCustom = eventType === "autre";

  // L'heure boucle sur les créneaux 06 h → 22 h (après 22 h on revient à 6 h).
  function shiftHour(delta: number) {
    const idx = HOUR_SLOTS.indexOf(hour);
    const next =
      idx === -1
        ? delta > 0
          ? HOUR_SLOTS[0]
          : HOUR_SLOTS[HOUR_SLOTS.length - 1]
        : HOUR_SLOTS[(idx + delta + HOUR_SLOTS.length) % HOUR_SLOTS.length];
    setTime(`${next}:${minute}`);
  }

  // La durée parcourt les crans proposés, bornée aux extrémités (10 min → 3 h).
  function shiftDuration(delta: number) {
    const choices = durationChoices(duration);
    const idx = choices.indexOf(duration);
    setDuration(choices[Math.min(choices.length - 1, Math.max(0, idx + delta))]);
  }

  function add() {
    setError("");
    startTransition(async () => {
      const result = await addPlannedEvent(playerId, {
        event_type: eventType,
        weekday,
        event_time: time,
        duration_minutes: duration,
        custom_name: isCustom ? customName : undefined,
        custom_icon: isCustom ? customIcon : undefined,
        custom_color: isCustom ? customColor : undefined,
      });
      if (!result.ok) setError(result.error);
    });
  }

  function remove(eventId: string) {
    startTransition(async () => {
      await deletePlannedEvent(eventId, playerId);
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
              <option value="autre">➕ Personnalisée</option>
            </EdSelect>
          </EdField>

          {/* Activité perso : nom + icône + couleur choisis par le joueur */}
          {isCustom && (
            <>
              <EdField label="Nom de l'activité">
                <EdInput
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value.slice(0, 40))}
                  placeholder="Ex. : natation, vélo, méditation…"
                />
              </EdField>
              <div>
                <p className="ed-overline mb-1.5">Icône</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {HABIT_ICON_NAMES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCustomIcon(n)}
                      aria-label={n}
                      className={`flex h-10 items-center justify-center rounded-md transition-colors ${
                        customIcon === n
                          ? "text-paper"
                          : "bg-tan text-meta hover:bg-ink/10 hover:text-ink"
                      }`}
                      style={
                        customIcon === n
                          ? { backgroundColor: HABIT_COLORS[customColor].hex }
                          : undefined
                      }
                    >
                      <HabitIcon name={n} size={18} strokeWidth={1.8} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="ed-overline mb-1.5">Couleur</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(HABIT_COLORS) as HabitColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCustomColor(c)}
                      aria-label={HABIT_COLORS[c].label}
                      title={HABIT_COLORS[c].label}
                      className={`h-9 w-9 rounded-md transition-transform ${
                        customColor === c
                          ? "scale-110 ring-2 ring-ink ring-offset-2"
                          : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: HABIT_COLORS[c].hex }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

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
            {/* stepper − / + (un tap = une heure, boucle 06 h → 22 h) + pastilles minutes */}
            <Stepper
              value={`${hour} h ${minute}`}
              prevLabel="Une heure plus tôt"
              nextLabel="Une heure plus tard"
              onPrev={() => shiftHour(-1)}
              onNext={() => shiftHour(1)}
            />
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {MINUTE_SLOTS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTime(`${hour}:${m}`)}
                  aria-label={`${m} minutes`}
                  className={`ed-value rounded-md py-2 text-sm transition-all active:scale-95 ${
                    minute === m
                      ? "bg-ink text-paper"
                      : "border-2 border-ink/25 bg-transparent text-meta hover:border-ink hover:text-ink"
                  }`}
                >
                  :{m}
                </button>
              ))}
            </div>
          </EdField>
          <EdField label="Durée">
            {/* même stepper : un tap = un cran dans les durées proposées */}
            <Stepper
              value={formatDuration(duration)}
              prevLabel="Durée plus courte"
              nextLabel="Durée plus longue"
              onPrev={() => shiftDuration(-1)}
              onNext={() => shiftDuration(1)}
            />
          </EdField>
          {error && <p className="ed-meta text-[11px] text-orange">{error}</p>}
          <EdButton
            variant="navy"
            full
            onClick={add}
            disabled={isPending || (isCustom && !customName.trim())}
          >
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
                {dayEvents.map((event) => {
                  const hex = eventColorHex(event);
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 rounded-md border-2 border-ink px-3 py-2.5"
                      style={{
                        backgroundColor: habitPale(hex, "bg"),
                        borderLeft: `6px solid ${hex}`,
                      }}
                    >
                      <span className="shrink-0" aria-hidden style={{ color: hex }}>
                        <EventTypeIcon type={event.event_type} event={event} size={18} colored />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="ed-value truncate text-base text-ink">{eventLabel(event)}</p>
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
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
