"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { deletePlannedEvent } from "@/app/actions/planning";
import { TrashIcon } from "@/components/icons";
import { WeekEventForm, type EditableEvent } from "@/components/coach/WeekEventForm";

export type DayItemStatus = "done" | "not_done" | "todo";

export interface DayItem {
  label: string;
  /** « 18:00 », ou « Séance » pour une séance du programme */
  when: string;
  status: DayItemStatus;
  /** créneau de la semaine type (modifiable) ; absent pour une séance du programme */
  event?: EditableEvent;
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
 * « Semaine » sur l'onglet Messages de la fiche joueur : sept cases, un clic
 * sur un jour déroule ce qui était prévu (créneaux du planning et séances du
 * programme) avec fait, pas fait ou à venir. Avec `playerId`, la carte
 * planifie sur place : « + » ajoute un créneau (un ou plusieurs jours), le
 * crayon le modifie, la corbeille le supprime — l'onglet Semaine en miniature,
 * sans quitter la conversation. Les séances se gèrent dans Programme.
 */
export function WeekDaysCard({
  days,
  today,
  playerId,
}: {
  days: DayDetail[];
  today: number;
  playerId?: string;
}) {
  const [selected, setSelected] = useState(today);
  // le formulaire ouvert : ajout (« new ») ou l'id du créneau modifié
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = days.find((d) => d.day === selected);

  function remove(eventId: string) {
    if (!playerId) return;
    start(async () => {
      await deletePlannedEvent(eventId, playerId);
    });
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle className="!mb-0">Semaine</CardTitle>
        {playerId && (
          <Link
            href={`/coach/joueurs/${playerId}?onglet=semaine`}
            className="text-[12px] font-semibold text-navy-400 hover:text-accent"
          >
            Semaine type complète
          </Link>
        )}
      </div>
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
              onClick={() => {
                setSelected(d.day);
                setEditing(null);
              }}
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-400">
            {DAY_LONG[selected - 1]}
            {current && current.planned > 0
              ? ` · ${current.done}/${current.planned} fait${current.done > 1 ? "s" : ""}`
              : ""}
          </p>
          {playerId && editing !== "new" && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[12px] font-bold text-navy-900 shadow-soft hover:text-accent"
            >
              <Plus size={14} strokeWidth={2.6} aria-hidden /> Ajouter
            </button>
          )}
        </div>

        {playerId && editing === "new" && (
          <div className="mb-2">
            <WeekEventForm playerId={playerId} day={selected} onDone={() => setEditing(null)} />
          </div>
        )}

        {!current || current.items.length === 0 ? (
          editing !== "new" && <p className="text-[13px] text-navy-400">Rien de prévu ce jour-là.</p>
        ) : (
          <ul className="space-y-1.5">
            {current.items.map((it, i) =>
              playerId && it.event && editing === it.event.id ? (
                <li key={it.event.id}>
                  <WeekEventForm
                    playerId={playerId}
                    day={selected}
                    event={it.event}
                    onDone={() => setEditing(null)}
                  />
                </li>
              ) : (
                <li
                  key={it.event?.id ?? `s-${i}`}
                  className="group flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-navy-900">{it.label}</span>
                    <span className="text-[11.5px] text-navy-400">{it.when}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_LOOK[it.status].cls}`}>
                      {STATUS_LOOK[it.status].label}
                    </span>
                    {playerId && it.event && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing(it.event!.id)}
                          aria-label={`Modifier ${it.label}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-400 hover:bg-cream hover:text-navy-900"
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(it.event!.id)}
                          disabled={pending}
                          aria-label={`Supprimer ${it.label}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-400 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
