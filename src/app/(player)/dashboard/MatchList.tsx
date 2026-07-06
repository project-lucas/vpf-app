"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, TrophyIcon } from "@/components/icons";

export interface MatchRow {
  id: string;
  dateLabel: string;
  minutes: number;
  rebounds: number;
  steals: number;
  points: number;
  /** tirs réussis/tentés, null si non renseignés à la saisie */
  shots: { made: number; attempted: number } | null;
  /** 3 pts réussis/tentés, null si non renseignés à la saisie */
  threes: { made: number; attempted: number } | null;
  /** écart de points vs le match précédent ; null pour le tout premier match */
  delta: number | null;
  isRecord: boolean;
}

/** Liste des matchs : 3 visibles par défaut, "Voir tout" déplie la liste complète. */
export function MatchList({ rows }: { rows: MatchRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 3);

  return (
    <>
      <div className="divide-y divide-ink/15">
        {visible.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-ink">{r.dateLabel}</p>
                {r.isRecord && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warm/25 px-2 py-0.5 text-[10px] font-bold text-orange">
                    <TrophyIcon size={11} /> Record
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-medium text-meta">
                  {r.minutes} min
                </span>
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-medium text-meta">
                  {r.rebounds} rbds
                </span>
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-medium text-meta">
                  {r.steals} int.
                </span>
                {r.shots && r.shots.attempted > 0 && (
                  <span className="rounded-full bg-warm/25 px-2 py-0.5 text-[11px] font-semibold text-orange">
                    {r.shots.made}/{r.shots.attempted} tirs ·{" "}
                    {Math.round((r.shots.made / r.shots.attempted) * 100)} %
                  </span>
                )}
                {r.threes && r.threes.attempted > 0 && (
                  <span className="rounded-full bg-warm/25 px-2 py-0.5 text-[11px] font-semibold text-orange">
                    {r.threes.made}/{r.threes.attempted} à 3 pts
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.delta !== null &&
                (r.delta > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-ink">
                    <ArrowUpIcon size={13} /> +{r.delta}
                  </span>
                ) : r.delta < 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-orange">
                    <ArrowDownIcon size={13} /> {r.delta}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-muted">—</span>
                ))}
              <p className="ed-value text-xl text-ink">
                {r.points} <span className="text-xs font-semibold text-meta">pts</span>
              </p>
            </div>
          </div>
        ))}
      </div>
      {rows.length > 3 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 w-full pt-2 text-center text-xs font-bold text-meta hover:text-ink"
        >
          {expanded ? "Réduire" : `Voir tout (${rows.length})`}
        </button>
      )}
      <p className="mt-2 text-xs text-muted">
        Les statistiques saisies ne peuvent plus être modifiées.
      </p>
    </>
  );
}
