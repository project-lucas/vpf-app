"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { HYGIENE_CRITERIA, HYGIENE_MAX, formatHours, type HygieneAverages } from "@/lib/hygiene";

interface RadarDatum {
  axis: string;
  /** moyenne sur 5, arrondie au dixième */
  moyenne: number;
  /** valeur lisible affichée dans l'infobulle (« 4,2/5 ») */
  display: string;
}

function HygieneTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RadarDatum }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border-2 border-ink bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-ink">{d.axis}</p>
      <p className="mt-0.5 text-meta">
        Moyenne <span className="font-bold tabular-nums text-ink">{d.display}</span>
      </p>
    </div>
  );
}

/**
 * Moyennes d'hygiène de vie : le sommeil sort en durée (jamais noté), les
 * quatre critères notés sur 5 forment le radar. Une seule série — la moyenne de
 * tout l'historique de notation du joueur.
 */
export function HygieneRadar({ averages }: { averages: HygieneAverages }) {
  const round = (v: number) => Math.round(v * 10) / 10;

  const data: RadarDatum[] = HYGIENE_CRITERIA.map((criterion) => {
    const moyenne = round(averages.scores[criterion.key]);
    return { axis: criterion.label, moyenne, display: `${moyenne}/5` };
  });

  return (
    <div className="w-full">
      {/* Sommeil : une durée moyenne, pas une note — d'où sa place hors du radar */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-card px-4 py-3">
        <div>
          <p className="ed-overline">Sommeil</p>
          <p className="mt-0.5 font-body text-[11px] text-meta">
            Moyenne sur {averages.days} nuit{averages.days > 1 ? "s" : ""}
          </p>
        </div>
        <p className="ed-value text-[32px] leading-none text-ink">
          {formatHours(averages.sleepHours)}
        </p>
      </div>

      <div className="h-72 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke="rgba(28,58,75,0.2)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "#5a6a62", fontSize: 11, fontWeight: 600 }}
            />
            <PolarRadiusAxis domain={[0, HYGIENE_MAX]} tick={false} axisLine={false} />
            <Tooltip content={<HygieneTooltip />} />
            <Radar
              name="Moyenne"
              dataKey="moyenne"
              stroke="#c0392b"
              strokeWidth={2.5}
              fill="#c0392b"
              fillOpacity={0.18}
              dot={{ r: 3.5, fill: "#c0392b", stroke: "#f7efdc", strokeWidth: 1.5 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Lecture chiffrée : le radar donne la forme, ces lignes donnent les valeurs */}
      <div className="mt-1 space-y-1.5">
        {data.map((d) => (
          <div
            key={d.axis}
            className="flex items-center justify-between gap-3 rounded-md bg-tan px-3 py-2"
          >
            <span className="ed-meta shrink-0 text-[11px] text-ink">{d.axis}</span>
            <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
              <span
                className="block h-full bg-orange"
                style={{ width: `${(d.moyenne / HYGIENE_MAX) * 100}%` }}
              />
            </span>
            <span className="ed-value shrink-0 text-sm text-ink">{d.display}</span>
          </div>
        ))}
      </div>

      <p className="ed-meta mt-3 text-center text-[10px] text-muted">
        Moyenne sur {averages.days} jour{averages.days > 1 ? "s" : ""} noté
        {averages.days > 1 ? "s" : ""}
      </p>
    </div>
  );
}
