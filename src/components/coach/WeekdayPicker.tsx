"use client";

import { WEEKDAY_LABELS, WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { ALL_WEEKDAYS, weekdaysLabel } from "@/lib/weekdays";

// ré-exportés pour les composants client qui les prenaient déjà ici
export { ALL_WEEKDAYS, weekdaysLabel };

/**
 * Choix des jours de la semaine (1 = lundi … 7 = dimanche), au format des
 * `planned_events`. Sert partout où le staff range une séance dans le
 * programme d'un joueur (migration 0035).
 *
 * Plusieurs jours à la fois : une séance technique le lundi ET le jeudi, une
 * routine tous les jours — chaque jour devient une affectation à part entière,
 * cochée séparément par le joueur. « Chaque jour » coche les sept d'un coup.
 */
export function WeekdayPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
  disabled?: boolean;
}) {
  const everyDay = value.length === 7;

  function toggle(day: number) {
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b)
    );
  }

  return (
    <div>
      <div className="flex gap-1">
        {WEEKDAY_LABELS_SHORT.map((label, i) => {
          const day = i + 1;
          const active = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle(day)}
              disabled={disabled}
              aria-pressed={active}
              aria-label={WEEKDAY_LABELS[i]}
              className={`min-w-0 flex-1 rounded-lg px-1 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                active
                  ? "bg-navy-800 text-white"
                  : "border border-navy-200 bg-white text-navy-500 hover:border-navy-400"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-navy-600">
        <input
          type="checkbox"
          checked={everyDay}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? ALL_WEEKDAYS : [])}
          className="h-4 w-4 accent-navy-800"
        />
        Chaque jour
      </label>
    </div>
  );
}

/**
 * Même choix en version compacte (une ligne de liste) : le jour d'une séance
 * déjà affectée se change sans quitter la fiche.
 */
export function WeekdaySelect({
  value,
  onChange,
  disabled = false,
  label = "Jour de la séance",
}: {
  value: number | null;
  onChange: (weekday: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      aria-label={label}
      className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-semibold focus:border-navy-600 focus:outline-none disabled:opacity-40 ${
        value === null
          ? "border-warning bg-warning-soft text-warning"
          : "border-navy-200 bg-white text-navy-600"
      }`}
    >
      {value === null && <option value="">À replacer</option>}
      {WEEKDAY_LABELS.map((day, i) => (
        <option key={day} value={i + 1}>
          {day}
        </option>
      ))}
    </select>
  );
}
