"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, Settings, TrendingUp } from "lucide-react";
import { deleteHabit } from "@/app/actions/habits";
import { addDays } from "@/lib/dates";
import { habitPale } from "@/lib/constants";
import { HabitHeatmap } from "./HabitHeatmap";
import { HabitIcon } from "./HabitIcon";
import { XIcon, ChevronLeftIcon } from "@/components/icons";
import type { Habit } from "@/lib/types";

const MONTHS_SHORT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];
const DAY_HEADERS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

interface Props {
  habit: Habit;
  checks: Set<string>;
  colorHex: string;
  today: string;
  total: number;
  readOnly?: boolean;
  onToggle: (date: string) => void;
  onClose: () => void;
  onEdit?: () => void;
}

/** "2026-07" -> mois précédent/suivant */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fiche détaillée d'une habitude (bottom sheet, fond blanc minimaliste).
 * Rendue via un portal à la racine du document : indispensable pour que le
 * positionnement fixed ne soit pas cassé par les transforms des cartes.
 */
export function HabitDetailModal({
  habit,
  checks,
  colorHex,
  today,
  total,
  readOnly = false,
  onToggle,
  onClose,
  onEdit,
}: Props) {
  const router = useRouter();
  const [month, setMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [my, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(my, mm, 0)).getUTCDate();
  const firstDate = `${month}-01`;
  const firstDow = (() => {
    const dow = new Date(Date.UTC(my, mm - 1, 1)).getUTCDay();
    return dow === 0 ? 7 : dow;
  })();

  const minDate = addDays(today, -365);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow - 1 }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(firstDate, i)),
  ];

  async function handleDelete() {
    await deleteHabit(habit.id);
    onClose();
    router.refresh();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-lg border-2 border-ink bg-card p-5 pb-8 shadow-2xl sm:rounded-lg sm:pb-5">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: habitPale(colorHex, "bg") }}
              aria-hidden
            >
              <HabitIcon name={habit.icon} size={22} color={colorHex} />
            </span>
            <div className="min-w-0">
              <h2 className="ed-value truncate text-lg text-ink">{habit.name}</h2>
              <p className="text-xs text-meta">
                {habit.description || "Pas de description"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-full p-1.5 text-meta hover:bg-ink/10"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Heatmap étendue avec labels des mois et des jours */}
        <HabitHeatmap
          checkDates={checks}
          colorHex={colorHex}
          today={today}
          readOnly={readOnly}
          onToggle={onToggle}
          showMonthLabels
          showDayLabels
        />

        {/* Barre d'infos */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-semibold text-meta">
            {habit.goal || "Pas d'objectif"}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: habitPale(colorHex, "bg"), color: colorHex }}
          >
            <TrendingUp size={12} /> {total} fois au total
          </span>
          {!readOnly && (
            <div className="ml-auto flex gap-1.5">
              {onEdit && (
                <button
                  onClick={onEdit}
                  aria-label="Modifier"
                  className="rounded-md bg-ink/10 px-3 py-1.5 text-ink hover:bg-ink/15"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button
                onClick={() => setConfirmDelete(!confirmDelete)}
                aria-label="Paramètres"
                className="rounded-md bg-ink/10 px-3 py-1.5 text-ink hover:bg-ink/15"
              >
                <Settings size={16} />
              </button>
            </div>
          )}
        </div>

        {confirmDelete && (
          <button
            onClick={handleDelete}
            className="mt-3 w-full rounded-md bg-orange/15 py-2.5 text-sm font-bold text-orange"
          >
            Supprimer définitivement cette habitude et son historique
          </button>
        )}

        {/* Calendrier mensuel */}
        <div className="mt-5 rounded-md bg-ink/5 p-3.5">
          <div className="grid grid-cols-7 gap-1">
            {DAY_HEADERS.map((d) => (
              <span key={d} className="pb-1 text-center text-[10px] font-semibold text-meta">
                {d}
              </span>
            ))}
            {cells.map((date, i) => {
              if (!date) return <span key={`pad-${i}`} />;
              const day = Number(date.slice(8, 10));
              const done = checks.has(date);
              const isToday = date === today;
              const disabled = readOnly || date > today || date < minDate;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(date)}
                  className={`flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition-transform ${
                    disabled ? "cursor-default" : "active:scale-110"
                  } ${isToday ? "ring-2 ring-ink/60" : ""} ${
                    date > today ? "text-muted" : done ? "text-paper" : "text-meta"
                  }`}
                  style={{
                    backgroundColor: done
                      ? colorHex
                      : habitPale(colorHex, date > today ? "future" : "cell"),
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer : navigation entre les mois */}
          <div className="mt-3 flex items-center justify-between border-t border-hair pt-3">
            <button
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Mois précédent"
              className="rounded-md p-1.5 text-meta hover:bg-ink/10"
            >
              <ChevronLeftIcon size={18} />
            </button>
            <span className="text-sm font-bold capitalize text-ink">
              {MONTHS_SHORT[mm - 1]} {my}
            </span>
            <button
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Mois suivant"
              className="rounded-md p-1.5 text-meta hover:bg-ink/10"
            >
              <ChevronLeftIcon size={18} className="rotate-180" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
