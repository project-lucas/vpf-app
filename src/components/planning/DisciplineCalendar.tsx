"use client";

import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon } from "@/components/icons";
import { WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { isoWeekdayOf } from "@/lib/dates";
import { Modal } from "@/components/ui/Modal";

/** Issue d'une journée pointée : tout fait / en partie / rien de fait. */
export type DayOutcome = "complete" | "partial" | "missed";

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function dayColor(outcome: DayOutcome | undefined): string {
  if (outcome === "complete") return "bg-orange font-bold text-paper";
  if (outcome === "partial") return "bg-orange/25 font-semibold text-orange";
  if (outcome === "missed") return "bg-ink/15 text-muted";
  return "bg-ink/5 text-muted"; // repos : rien n'était pointé ce jour-là
}

/**
 * Historique de discipline : icône calendrier (coin de "Ma semaine") qui
 * ouvre le détail des journées complètes — calendrier du mois navigable et
 * heatmap de l'année, dans les mêmes couleurs que les checkpoints.
 */
export function DisciplineCalendar({
  history,
  today,
}: {
  history: Record<string, DayOutcome>;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"month" | "year">("month");
  const [todayY, todayM] = today.split("-").map(Number);
  const [cursor, setCursor] = useState({ y: todayY, m: todayM });

  const atCurrentMonth = cursor.y === todayY && cursor.m === todayM;

  const monthDates = Array.from({ length: daysInMonth(cursor.y, cursor.m) }, (_, i) => ({
    date: `${cursor.y}-${pad(cursor.m)}-${pad(i + 1)}`,
    day: i + 1,
  }));
  const leadingBlanks = isoWeekdayOf(`${cursor.y}-${pad(cursor.m)}-01`) - 1;
  const monthComplete = monthDates.filter((d) => history[d.date] === "complete").length;

  const yearComplete = Object.entries(history).filter(
    ([date, o]) => date.startsWith(`${todayY}-`) && o === "complete"
  ).length;

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const m = c.m + delta;
      return m < 1 ? { y: c.y - 1, m: 12 } : m > 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m };
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Voir l'historique de mes journées"
        title="Historique de mes journées"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-meta transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
      >
        <CalendarIcon size={17} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Ma discipline" variant="retro">
        {/* sous-onglets mois / année */}
        <div className="mb-4 flex gap-1 rounded-md bg-ink/5 p-1">
          {(
            [
              { key: "month", label: "Mois" },
              { key: "year", label: "Année" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`ed-meta flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[11px] transition-colors duration-200 ${
                view === t.key ? "bg-paper text-ink shadow-sm" : "text-meta hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === "month" ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="Mois précédent"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-ink/5"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <p className="ed-value text-base capitalize text-ink">
                {MONTHS_FR[cursor.m - 1]} {cursor.y}
              </p>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="Mois suivant"
                disabled={atCurrentMonth}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-ink/5 disabled:cursor-default disabled:opacity-0"
              >
                <ChevronLeftIcon size={16} className="rotate-180" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS_SHORT.map((l) => (
                <span key={l} className="ed-meta text-center text-[10px] text-muted">
                  {l[0]}
                </span>
              ))}
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {monthDates.map((d) => (
                <span
                  key={d.date}
                  title={d.date}
                  className={`flex h-9 items-center justify-center rounded-md text-[11px] ${
                    d.date > today ? "text-muted/60" : dayColor(history[d.date])
                  } ${d.date === today ? "outline outline-2 -outline-offset-1 outline-ink" : ""}`}
                >
                  {d.day}
                </span>
              ))}
            </div>

            <p className="ed-meta mt-3 text-[10px] text-meta">
              {monthComplete > 0
                ? `${monthComplete} journée${monthComplete > 1 ? "s" : ""} complète${monthComplete > 1 ? "s" : ""} ce mois-ci`
                : "Aucune journée complète ce mois-ci — la prochaine est à toi."}
            </p>
          </div>
        ) : (
          <div>
            <div className="space-y-1.5">
              {MONTHS_SHORT.map((label, mi) => {
                const m = mi + 1;
                const count = daysInMonth(todayY, m);
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="ed-meta w-7 shrink-0 text-[9px] text-meta">{label}</span>
                    {/* 31 colonnes fixes pour aligner les jours d'un mois à l'autre */}
                    <div className="grid flex-1 grid-cols-[repeat(31,minmax(0,1fr))] gap-[2px]">
                      {Array.from({ length: count }, (_, di) => {
                        const date = `${todayY}-${pad(m)}-${pad(di + 1)}`;
                        return (
                          <span
                            key={date}
                            title={date}
                            className={`aspect-square w-full rounded-[2px] ${
                              date > today
                                ? "bg-ink/5"
                                : history[date] === "complete"
                                  ? "bg-orange"
                                  : history[date] === "partial"
                                    ? "bg-orange/30"
                                    : history[date] === "missed"
                                      ? "bg-ink/20"
                                      : "bg-ink/5"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="ed-meta mt-3 text-[10px] text-meta">
              {yearComplete > 0
                ? `${yearComplete} journée${yearComplete > 1 ? "s" : ""} complète${yearComplete > 1 ? "s" : ""} en ${todayY}`
                : `Aucune journée complète en ${todayY} pour l'instant.`}
            </p>
          </div>
        )}

        {/* légende commune */}
        <div className="ed-meta mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-meta">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-orange" /> Complète
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-orange/30" /> Partielle
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-ink/20" /> Manquée
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-ink/5" /> Repos
          </span>
        </div>
      </Modal>
    </>
  );
}
