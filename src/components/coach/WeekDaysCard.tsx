"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";

export type DayItemStatus = "done" | "not_done" | "todo";

export interface DayItem {
  label: string;
  /** « 18:00 », ou « Séance » pour une séance du programme */
  when: string;
  status: DayItemStatus;
}

export interface DayDetail {
  day: number;
  planned: number;
  done: number;
  items: DayItem[];
}

const DAY_SHORT = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const DAY_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const STATUS_LOOK: Record<DayItemStatus, { label: string; cls: string }> = {
  done: { label: "Fait", cls: "bg-success-soft text-success" },
  not_done: { label: "Pas fait", cls: "bg-danger-soft text-danger" },
  todo: { label: "À venir", cls: "bg-cream text-navy-400" },
};

/**
 * « Sa semaine » sur la fiche joueur : sept cases, et un clic sur un jour
 * déroule juste en dessous ce qui était prévu — créneaux du planning et
 * séances du programme — avec, pour chacun, fait, pas fait ou à venir.
 */
export function WeekDaysCard({ days, today }: { days: DayDetail[]; today: number }) {
  const [selected, setSelected] = useState(today);
  const current = days.find((d) => d.day === selected);

  return (
    <Card>
      <CardTitle>Sa semaine</CardTitle>
      <div className="flex justify-between">
        {days.map((d) => {
          const past = d.day < today;
          const state =
            d.planned === 0
              ? "rest"
              : d.done >= d.planned
                ? "done"
                : past
                  ? d.done > 0
                    ? "partial"
                    : "missed"
                  : "todo";
          const look = {
            rest: "bg-cream text-navy-300",
            done: "bg-navy-800 text-white",
            partial: "bg-warning-soft text-warning",
            missed: "bg-danger-soft text-danger",
            todo: "bg-white text-navy-400 ring-1 ring-inset ring-sand",
          }[state];
          const isSel = d.day === selected;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => setSelected(d.day)}
              aria-pressed={isSel}
              className="flex flex-col items-center gap-1.5"
            >
              <span className={`text-[11px] font-bold ${d.day === today ? "text-accent" : "text-navy-400"}`}>
                {DAY_SHORT[d.day - 1]}
              </span>
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-[12px] font-extrabold transition-shadow ${look} ${
                  isSel ? "outline outline-2 outline-offset-2 outline-accent" : ""
                }`}
              >
                {state === "done" ? "✓" : state === "missed" ? "✕" : d.planned ? `${d.done}/${d.planned}` : "·"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-cream p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-navy-400">
          {DAY_LONG[selected - 1]}
          {current && current.planned > 0 ? ` · ${current.done}/${current.planned} fait${current.done > 1 ? "s" : ""}` : ""}
        </p>
        {!current || current.items.length === 0 ? (
          <p className="text-[13px] text-navy-400">Rien de prévu ce jour-là.</p>
        ) : (
          <ul className="space-y-1.5">
            {current.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-navy-900">{it.label}</span>
                  <span className="text-[11.5px] text-navy-400">{it.when}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_LOOK[it.status].cls}`}>
                  {STATUS_LOOK[it.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
