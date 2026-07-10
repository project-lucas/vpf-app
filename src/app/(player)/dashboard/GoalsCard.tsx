import { formatDateFr } from "@/lib/dates";
import type { PlayerGoal } from "@/lib/types";

/**
 * Mes objectifs : cibles chiffrées fixées par le coach, avec jauge de
 * progression. Le cap concret entre deux matchs — au-delà des badges.
 */
export function GoalsCard({ goals }: { goals: PlayerGoal[] }) {
  if (goals.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border-2 border-ink bg-card px-3.5 py-3">
      <p className="ed-overline">Mes objectifs</p>
      <div className="mt-2.5 space-y-3">
        {goals.map((g) => {
          const achieved = g.achieved_at !== null || g.current_value >= g.target_value;
          const pct = Math.min(
            100,
            Math.round(g.target_value > 0 ? (g.current_value / g.target_value) * 100 : 0)
          );
          return (
            <div key={g.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {achieved && <span aria-hidden>🏆 </span>}
                  {g.title}
                </p>
                <p className="ed-value shrink-0 text-sm text-ink">
                  {g.current_value}/{g.target_value}
                  {g.unit && <span className="ml-1 text-xs font-semibold text-meta">{g.unit}</span>}
                </p>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    achieved ? "bg-warm" : "bg-ink"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {g.deadline && !achieved && (
                <p className="ed-meta mt-1 text-[11px] text-meta">
                  Échéance : {formatDateFr(g.deadline)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
