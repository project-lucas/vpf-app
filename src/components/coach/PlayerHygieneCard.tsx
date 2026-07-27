import { formatDateFr } from "@/lib/dates";
import {
  HYGIENE_CRITERIA,
  HYGIENE_MAX,
  computeHygieneAverages,
  formatHours,
} from "@/lib/hygiene";
import { Card, CardTitle } from "@/components/ui/Card";
import type { HygieneLog } from "@/lib/types";

/** Combien de jours détaillés sous les moyennes (le reste alimente la moyenne). */
const RECENT_DAYS = 10;

/**
 * Hygiène de vie vue par le coach : moyennes de tout l'historique + les
 * dernières saisies. Lecture seule — seul le joueur note ses journées (0025).
 *
 * Cette carte reste affichée même si le joueur est repassé en offre perf :
 * l'écran disparaît côté joueur, pas l'historique côté coach.
 */
export function PlayerHygieneCard({
  logs,
  isFormation,
}: {
  logs: HygieneLog[];
  isFormation: boolean;
}) {
  const averages = computeHygieneAverages(logs);
  const recent = logs.slice(0, RECENT_DAYS);

  return (
    <Card>
      <CardTitle>Hygiène de vie</CardTitle>

      {!isFormation && (
        <p className="mb-3 rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-500">
          Ce joueur est en offre Perf : l&apos;écran Hygiène ne lui est plus affiché. Son
          historique est conservé et redevient visible s&apos;il repasse en Formation.
        </p>
      )}

      {averages.days === 0 ? (
        <p className="text-sm text-navy-400">
          {isFormation
            ? "Ce joueur n'a pas encore noté de journée."
            : "Aucune journée notée avant le passage en offre Perf."}
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-navy-50 px-3 py-2.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">
                Sommeil moyen
              </p>
              <p className="mt-0.5 text-xs text-navy-400">
                Sur {averages.days} nuit{averages.days > 1 ? "s" : ""} notée
                {averages.days > 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-2xl font-extrabold text-navy-800">
              {formatHours(averages.sleepHours)}
            </p>
          </div>

          <div className="space-y-1.5">
            {HYGIENE_CRITERIA.map((criterion) => {
              const value = Math.round(averages.scores[criterion.key] * 10) / 10;
              return (
                <div key={criterion.key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-semibold text-navy-500">
                    {criterion.label}
                  </span>
                  <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50">
                    <span
                      className="block h-full rounded-full bg-navy-700"
                      style={{ width: `${(value / HYGIENE_MAX) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-extrabold text-navy-800">
                    {value}/5
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-navy-400">
            Dernières journées
          </p>
          <div className="divide-y divide-navy-50">
            {recent.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-navy-500">{formatDateFr(log.log_date)}</span>
                <span className="text-xs font-semibold text-navy-700">
                  {formatHours(Number(log.sleep_hours))} · hydr. {log.hydration}/5 · gluc.{" "}
                  {log.carbs}/5 · prot. {log.proteins}/5 · vit. {log.vitamins}/5
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
