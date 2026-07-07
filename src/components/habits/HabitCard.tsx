"use client";

import { useEffect, useState, useTransition } from "react";
import { TrendingUp } from "lucide-react";
import { toggleHabitCheck } from "@/app/actions/habits";
import { HABIT_COLORS, habitPale } from "@/lib/constants";
import { successFeedback } from "@/lib/feedback";
import { HabitHeatmap } from "./HabitHeatmap";
import { HabitDetailModal } from "./HabitDetailModal";
import { HabitIcon } from "./HabitIcon";
import { CheckIcon } from "@/components/icons";
import { XpBurst } from "@/components/ui/XpBurst";
import { XP_VALUES } from "@/lib/gamification";
import type { HabitWithChecks } from "@/lib/types";

/**
 * Carte d'habitude minimaliste (style HabitKit) : fond blanc, icône sur fond
 * pastel, bouton ✓ dans la couleur de l'habitude, heatmap épurée sans labels.
 * L'habitude n'est pas quotidienne : le compteur s'additionne à chaque
 * validation. Un tap sur la carte ouvre la fiche détaillée.
 */
export function HabitCard({
  habit,
  today,
  readOnly = false,
  onEdit,
}: {
  habit: HabitWithChecks;
  today: string;
  readOnly?: boolean;
  onEdit?: () => void;
}) {
  const [, startTransition] = useTransition();
  const [checks, setChecks] = useState(() => new Set(habit.checkDates));
  const [detailOpen, setDetailOpen] = useState(false);
  const [xpBurst, setXpBurst] = useState(0);

  // resynchronise l'état optimiste quand les données serveur changent
  useEffect(() => {
    setChecks(new Set(habit.checkDates));
  }, [habit.checkDates]);

  const colorHex = HABIT_COLORS[habit.color]?.hex ?? HABIT_COLORS.gold.hex;
  const total = checks.size;
  const monthPrefix = today.slice(0, 7);
  const thisMonth = [...checks].filter((d) => d.startsWith(monthPrefix)).length;
  const doneToday = checks.has(today);

  function toggle(date: string) {
    // vibration + pop uniquement quand on coche (pas quand on décoche)
    if (!checks.has(date)) successFeedback();
    // mise à jour optimiste : le carré s'allume immédiatement
    setChecks((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
    startTransition(async () => {
      const result = await toggleHabitCheck(habit.id, date);
      if (!result.ok) {
        setChecks((prev) => {
          const next = new Set(prev);
          if (next.has(date)) next.delete(date);
          else next.add(date);
          return next;
        });
      }
    });
  }

  return (
    <div
      className="cursor-pointer rounded-md border-2 border-ink bg-card p-5 transition-transform active:scale-[0.99]"
      onClick={() => setDetailOpen(true)}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: habitPale(colorHex, "bg") }}
          aria-hidden
        >
          <HabitIcon name={habit.icon} size={20} color={colorHex} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{habit.name}</p>
          <p
            className="mt-0.5 flex items-center gap-1 text-[11px] font-bold"
            style={{ color: colorHex }}
          >
            <TrendingUp size={11} />
            {total} au total
            <span className="font-medium text-muted">
              · {thisMonth} ce mois-ci
            </span>
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!checks.has(today)) setXpBurst((b) => b + 1);
              toggle(today);
            }}
            aria-label={doneToday ? "Fait aujourd'hui" : "Marquer aujourd'hui"}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-all active:scale-90"
            style={
              doneToday
                ? { backgroundColor: colorHex, color: "#ffffff" }
                : { backgroundColor: habitPale(colorHex, "bg"), color: colorHex }
            }
          >
            <XpBurst amount={XP_VALUES.habitCheck} burstKey={xpBurst} />
            <CheckIcon size={20} />
          </button>
        )}
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <HabitHeatmap
          checkDates={checks}
          colorHex={colorHex}
          today={today}
          readOnly={readOnly}
          onToggle={toggle}
          showMonthLabels
        />
      </div>

      {detailOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <HabitDetailModal
            habit={habit}
            checks={checks}
            colorHex={colorHex}
            today={today}
            total={total}
            readOnly={readOnly}
            onToggle={toggle}
            onClose={() => setDetailOpen(false)}
            onEdit={
              onEdit
                ? () => {
                    setDetailOpen(false);
                    onEdit();
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
