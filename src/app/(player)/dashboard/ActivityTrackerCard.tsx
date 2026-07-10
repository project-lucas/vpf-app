"use client";

import { TrendingUp } from "lucide-react";
import { EVENT_TYPE_LABELS, HABIT_COLORS } from "@/lib/constants";
import { HabitHeatmap } from "@/components/habits/HabitHeatmap";
import { EventIconBadge, EVENT_TYPE_COLORS } from "@/components/planning/EventIcon";
import type { EventType, HabitColor } from "@/lib/types";

/**
 * Suivi automatique d'une activité planifiée : dès qu'un type d'événement
 * existe dans le planning du joueur, sa carte apparaît ici. L'historique est
 * alimenté par les pointages « fait » du planning — rien à cocher ici, tout
 * s'additionne tout seul. Les activités perso (« autre ») portent le nom,
 * l'icône et la couleur choisis par le joueur.
 */
export function ActivityTrackerCard({
  type,
  custom,
  checkDates,
  today,
}: {
  type: EventType;
  /** activité perso : nom + icône lucide + clé couleur choisis par le joueur */
  custom?: { name: string; icon: string; color: string };
  /** jours où l'activité a été pointée « fait » (dédupliqués) */
  checkDates: string[];
  today: string;
}) {
  const colorHex = custom
    ? (HABIT_COLORS[custom.color as HabitColor]?.hex ?? "#41668d")
    : (EVENT_TYPE_COLORS[type] ?? "#41668d");
  const label = custom?.name ?? EVENT_TYPE_LABELS[type];
  const monthPrefix = today.slice(0, 7);
  const thisMonth = checkDates.filter((d) => d.startsWith(monthPrefix)).length;

  return (
    <div className="rounded-md border-2 border-ink bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <EventIconBadge
          type={type}
          event={
            custom
              ? { event_type: "autre", custom_icon: custom.icon, custom_color: custom.color }
              : undefined
          }
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{label}</p>
          <p
            className="mt-0.5 flex items-center gap-1 text-[11px] font-bold"
            style={{ color: colorHex }}
          >
            <TrendingUp size={11} />
            {/* même unité des deux côtés : des JOURS (comme la heatmap dessous) */}
            {checkDates.length} {checkDates.length > 1 ? "jours" : "jour"} au total
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
