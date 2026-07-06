"use client";

import { TrendingUp } from "lucide-react";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { HabitHeatmap } from "@/components/habits/HabitHeatmap";
import { EventIconBadge, EVENT_TYPE_COLORS } from "@/components/planning/EventIcon";
import type { EventType } from "@/lib/types";

/**
 * Suivi automatique d'une activité planifiée : dès qu'un type d'événement
 * existe dans le planning du joueur, sa carte apparaît ici. L'historique est
 * alimenté par les pointages « fait » du planning — rien à cocher ici, tout
 * s'additionne tout seul.
 */
export function ActivityTrackerCard({
  type,
  checkDates,
  total,
  today,
}: {
  type: EventType;
  /** jours où l'activité a été pointée « fait » (dédupliqués) */
  checkDates: string[];
  /** nombre total de pointages « fait » (peut dépasser le nombre de jours) */
  total: number;
  today: string;
}) {
  const colorHex = EVENT_TYPE_COLORS[type] ?? "#41668d";
  const monthPrefix = today.slice(0, 7);
  const thisMonth = checkDates.filter((d) => d.startsWith(monthPrefix)).length;

  return (
    <div className="rounded-md border-2 border-ink bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <EventIconBadge type={type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">
            {EVENT_TYPE_LABELS[type]}
          </p>
          <p
            className="mt-0.5 flex items-center gap-1 text-[11px] font-bold"
            style={{ color: colorHex }}
          >
            <TrendingUp size={11} />
            {total} au total
            <span className="font-medium text-muted">· {thisMonth} ce mois-ci</span>
          </p>
        </div>
      </div>

      <HabitHeatmap
        checkDates={new Set(checkDates)}
        colorHex={colorHex}
        today={today}
        readOnly
        showMonthLabels
      />
    </div>
  );
}
