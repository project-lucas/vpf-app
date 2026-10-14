"use client";

import { useState, useTransition } from "react";
import { addPlannedEvent, updatePlannedEvent } from "@/app/actions/planning";
import {
  DEFAULT_EVENT_MINUTES,
  DURATION_OPTIONS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  formatDuration,
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_SHORT,
} from "@/lib/constants";
import type { EventType } from "@/lib/types";

export interface EditableEvent {
  id: string;
  type: EventType;
  weekday: number;
  time: string;
  duration: number;
  /** activité perso : son nom (le type ne se change pas, elle a son icône) */
  customName: string | null;
}

const FIELD =
  "w-full rounded-lg border border-sand bg-white px-2.5 py-1.5 text-[13px] text-navy-900 focus:border-accent focus:outline-none";

/**
 * Le formulaire compact de « Semaine » sur l'onglet Messages de la fiche :
 * ajout (un ou plusieurs jours) ou modification d'un créneau, sans quitter la
 * conversation. Mêmes actions serveur que l'éditeur complet de l'onglet
 * Semaine — mêmes contrôles, même RLS, même règle « pas deux créneaux à la
 * même heure ».
 */
export function WeekEventForm({
  playerId,
  day,
  event,
  onDone,
}: {
  playerId: string;
  /** jour présélectionné à l'ajout */
  day: number;
  /** présent = modification de ce créneau */
  event?: EditableEvent;
  onDone: () => void;
}) {
  const isEdit = Boolean(event);
  const isCustom = event?.type === "autre";
  const [type, setType] = useState<EventType>(event?.type ?? "training_basket");
  const [days, setDays] = useState<number[]>([event?.weekday ?? day]);
  const [time, setTime] = useState(event?.time ?? "18:00");
  const [duration, setDuration] = useState(event?.duration ?? DEFAULT_EVENT_MINUTES.training_basket);
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const durations = Array.from(new Set([...DURATION_OPTIONS, duration])).sort((a, b) => a - b);

  function toggleDay(d: number) {
    if (isEdit) return setDays([d]); // un créneau existant vit sur un seul jour
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  }

  function save() {
    setError("");
    start(async () => {
      const result = event
        ? await updatePlannedEvent(event.id, playerId, {
            ...(isCustom ? {} : { event_type: type }),
            weekday: days[0],
            event_time: time,
            duration_minutes: duration,
          })
        : await addPlannedEvent(playerId, {
            event_type: type,
            weekday: days,
            event_time: time,
            duration_minutes: duration,
            custom_name: type === "autre" ? customName : undefined,
          });
      if (!result.ok) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-sand bg-white p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
        {isCustom ? (
          <span className={`${FIELD} truncate bg-cream`}>{event?.customName ?? "Activité perso"}</span>
        ) : (
          <select
            aria-label="Type"
            value={type}
            onChange={(e) => {
              const t = e.target.value as EventType;
              setType(t);
              if (!isEdit) setDuration(DEFAULT_EVENT_MINUTES[t]);
            }}
            className={FIELD}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
            {!isEdit && <option value="autre">Personnalisée…</option>}
          </select>
        )}
        <input
          type="time"
          aria-label="Heure"
          step={300}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={`${FIELD} w-[92px]`}
        />
        <select
          aria-label="Durée"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={`${FIELD} w-[88px]`}
        >
          {durations.map((d) => (
            <option key={d} value={d}>
              {formatDuration(d)}
            </option>
          ))}
        </select>
      </div>

      {type === "autre" && !isEdit && (
        <input
          aria-label="Nom de l'activité"
          value={customName}
          onChange={(e) => setCustomName(e.target.value.slice(0, 40))}
          placeholder="Nom de l'activité (natation, vélo…)"
          className={FIELD}
        />
      )}

      <div className="grid grid-cols-7 gap-1" role="group" aria-label={isEdit ? "Jour" : "Jours"}>
        {WEEKDAY_LABELS_SHORT.map((label, i) => {
          const d = i + 1;
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={WEEKDAY_LABELS[i]}
              onClick={() => toggleDay(d)}
              className={`rounded-md py-1 text-[11px] font-bold transition-colors ${
                on ? "bg-navy-800 text-white" : "bg-cream text-navy-400 hover:text-navy-900"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error && <p className="text-[12px] font-semibold text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-navy-500 hover:bg-cream"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || days.length === 0 || (type === "autre" && !isEdit && !customName.trim())}
          className="rounded-lg bg-navy-800 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
        >
          {pending
            ? "…"
            : isEdit
              ? "Enregistrer"
              : days.length > 1
                ? `Ajouter sur ${days.length} jours`
                : "Ajouter"}
        </button>
      </div>
    </div>
  );
}
