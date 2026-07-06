"use client";

import { useEffect, useRef } from "react";
import { addDays, daysBetween, formatDateFr } from "@/lib/dates";
import { habitPale } from "@/lib/constants";

const MONTH_LABELS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const CELL = 11; // px
const GAP = 3; // px

interface Props {
  checkDates: Set<string>;
  colorHex: string;
  today: string;
  readOnly?: boolean;
  onToggle?: (date: string) => void;
  /** Vue détaillée : labels des mois en haut */
  showMonthLabels?: boolean;
  /** Vue détaillée : Mar/Jeu/Sam à gauche des lignes */
  showDayLabels?: boolean;
  /** Rendu sur fond sombre (fiche détaillée) */
  dark?: boolean;
}

/**
 * Grille calendrier type "contributions GitHub" sur l'année civile complète,
 * style minimaliste : carrés arrondis sans bordure, teinte pâle de la couleur
 * de l'habitude pour les jours non faits, couleur pleine pour les jours faits.
 * Glissable au doigt (mobile) et au cliquer-glisser (souris).
 */
export function HabitHeatmap({
  checkDates,
  colorHex,
  today,
  readOnly,
  onToggle,
  showMonthLabels = false,
  showDayLabels = false,
  dark = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // cliquer-glisser à la souris (le tactile défile nativement)
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || !scrollRef.current) return;
    drag.current = {
      down: true,
      startX: e.clientX,
      startScroll: scrollRef.current.scrollLeft,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.down || !scrollRef.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 5) drag.current.moved = true;
    scrollRef.current.scrollLeft = drag.current.startScroll - dx;
  }

  function onPointerUp() {
    drag.current.down = false;
  }

  function handleToggle(date: string) {
    // ignore le "clic" qui termine un glissement
    if (drag.current.moved) return;
    onToggle?.(date);
  }

  const year = today.slice(0, 4);
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;

  const isoDow = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow === 0 ? 7 : dow;
  };

  const firstMonday = addDays(jan1, 1 - isoDow(jan1));
  const weekCount = Math.floor(daysBetween(firstMonday, dec31) / 7) + 1;
  const currentWeekIndex = Math.floor(daysBetween(firstMonday, today) / 7);

  // cale la vue pour que la semaine en cours soit visible (proche du bord droit)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = (currentWeekIndex + 2) * (CELL + GAP) - el.clientWidth;
    el.scrollLeft = Math.max(0, target);
  }, [currentWeekIndex]);

  const weeks = Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d))
  );

  const labelColor = dark ? "text-paper/40" : "text-meta";
  const todayRing = dark ? "ring-1 ring-paper/80" : "ring-1 ring-ink/50";

  let lastMonth = -1;

  return (
    <div className="flex gap-1.5">
      {showDayLabels && (
        <div
          className={`flex shrink-0 flex-col gap-[3px] ${showMonthLabels ? "mt-[17px]" : ""}`}
        >
          {DAY_LABELS.map((label, i) => (
            <span
              key={label}
              className={`flex h-[11px] items-center text-[9px] font-medium ${labelColor}`}
            >
              {i % 2 === 1 ? label : ""}
            </span>
          ))}
        </div>
      )}
      <div
        ref={scrollRef}
        className="scrollbar-none min-w-0 flex-1 cursor-grab touch-pan-x select-none overflow-x-auto pb-1 active:cursor-grabbing"
        dir="ltr"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="inline-block">
          {/* étiquettes de mois (vue détaillée uniquement) */}
          {showMonthLabels && (
            <div className="mb-1 flex gap-[3px]">
              {weeks.map((week) => {
                const month = Number(week[0].split("-")[1]) - 1;
                const showLabel = month !== lastMonth && week[0] >= jan1;
                lastMonth = month;
                return (
                  <div key={week[0]} className="w-[11px] shrink-0 overflow-visible">
                    {showLabel && (
                      <span className={`block w-8 text-[9px] font-medium ${labelColor}`}>
                        {MONTH_LABELS[month]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* grille */}
          <div className="flex gap-[3px]">
            {weeks.map((week) => (
              <div key={week[0]} className="flex shrink-0 flex-col gap-[3px]">
                {week.map((date) => {
                  // jours futurs : teinte à peine visible, non cliquables
                  if (date > today) {
                    return (
                      <div
                        key={date}
                        className="h-[11px] w-[11px] rounded-[4px]"
                        style={{ backgroundColor: habitPale(colorHex, "future") }}
                      />
                    );
                  }
                  const done = checkDates.has(date);
                  const isToday = date === today;
                  const clickable = !readOnly && onToggle;
                  const tooltip = `${formatDateFr(date)} — ${done ? "Fait" : "Pas fait"}`;
                  return (
                    <button
                      key={date}
                      type="button"
                      aria-label={tooltip}
                      title={tooltip}
                      disabled={!clickable}
                      onClick={clickable ? () => handleToggle(date) : undefined}
                      className={`h-[11px] w-[11px] rounded-[4px] transition-transform ${
                        clickable ? "active:scale-125" : "cursor-default"
                      } ${isToday ? todayRing : ""}`}
                      style={{
                        backgroundColor: done ? colorHex : habitPale(colorHex, "cell"),
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
