import { ArrowDownIcon, ArrowUpIcon } from "@/components/icons";

/**
 * Ma semaine : discipline de la semaine en cours (pointages « fait » sur
 * planifié) et tendance en points de pourcentage vs la semaine dernière.
 */
export function WeekSummaryCard({
  plannedCount,
  doneCount,
  lastWeek,
}: {
  plannedCount: number;
  doneCount: number;
  lastWeek: { planned: number; done: number } | null;
}) {
  if (plannedCount === 0) return null;

  const pct = Math.min(100, Math.round((doneCount / plannedCount) * 100));
  const lastPct =
    lastWeek && lastWeek.planned > 0
      ? Math.min(100, Math.round((lastWeek.done / lastWeek.planned) * 100))
      : null;
  // pas de tendance tant que rien n'est pointé : un lundi matin à 0 % ne doit
  // pas afficher une grosse chute rouge vs la semaine passée
  const delta = lastPct === null || doneCount === 0 ? null : pct - lastPct;

  return (
    <div className="mb-4 rounded-md border-2 border-ink bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="ed-overline">Ma semaine</p>
        {delta !== null &&
          (delta > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-bold text-ink">
              <ArrowUpIcon size={12} /> +{delta} pts
            </span>
          ) : delta < 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange/10 px-2 py-0.5 text-[11px] font-bold text-orange">
              <ArrowDownIcon size={12} /> {delta} pts
            </span>
          ) : (
            <span className="rounded-full bg-tan px-2 py-0.5 text-[11px] font-bold text-meta">
              = semaine dernière
            </span>
          ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              pct >= 100 ? "bg-warm" : "bg-ink"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="ed-value shrink-0 text-sm text-ink">
          {doneCount}/{plannedCount}
          <span className="ml-1.5 text-xs font-semibold text-meta">{pct} %</span>
        </p>
      </div>
    </div>
  );
}
