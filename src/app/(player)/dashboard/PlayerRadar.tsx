"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface RadarMatch {
  points: number;
  minutes: number;
  rebounds: number;
  steals: number;
}

const AXES: { key: keyof RadarMatch; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "minutes", label: "Minutes" },
  { key: "rebounds", label: "Rebonds" },
  { key: "steals", label: "Interceptions" },
];

interface RadarDatum {
  stat: string;
  moyenne: number;
  dernier: number;
  lastVal: number;
  avgVal: number;
}

/** Tooltip : les valeurs réelles (pas les % normalisés affichés par le radar). */
function RadarTooltip({
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
      <p className="mb-1 font-bold text-ink">{d.stat}</p>
      <p className="flex items-center gap-1.5 text-ink">
        <span className="h-2 w-2 rounded-full bg-ink" />
        Dernier match <span className="ml-auto font-bold tabular-nums">{d.lastVal}</span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-meta">
        <span className="h-2 w-2 rounded-full bg-warm" />
        Moyenne <span className="ml-auto font-bold tabular-nums">{d.avgVal}</span>
      </p>
    </div>
  );
}

/**
 * Radar "Profil joueur" : moyenne de tous les matchs (aire semi-transparente)
 * vs dernier match (contour plein avec points). Chaque axe est normalisé sur
 * le maximum observé pour cette stat, les échelles étant très différentes ;
 * le tooltip rétablit les valeurs réelles.
 */
export function PlayerRadar({ matches }: { matches: RadarMatch[] }) {
  if (matches.length === 0) return null;
  const last = matches[0];

  const data: RadarDatum[] = AXES.map((a) => {
    const max = Math.max(1, ...matches.map((m) => m[a.key]));
    const avg = matches.reduce((sum, m) => sum + m[a.key], 0) / matches.length;
    return {
      stat: a.label,
      moyenne: Math.round((avg / max) * 100),
      dernier: Math.round((last[a.key] / max) * 100),
      lastVal: last[a.key],
      avgVal: Math.round(avg * 10) / 10,
    };
  });

  return (
    <div className="h-64 w-full">
      <div className="h-full w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="45%" outerRadius="72%">
          <defs>
            <linearGradient id="radar-dernier" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1C3A4B" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#1C3A4B" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <PolarGrid stroke="rgba(28,58,75,0.2)" />
          <PolarAngleAxis
            dataKey="stat"
            tick={{ fill: "#5A6A62", fontSize: 11, fontWeight: 600 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip content={<RadarTooltip />} />
          <Radar
            name="Moyenne des matchs"
            dataKey="moyenne"
            stroke="#E8A87C"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="#E8A87C"
            fillOpacity={0.18}
          />
          <Radar
            name="Dernier match"
            dataKey="dernier"
            stroke="#1C3A4B"
            strokeWidth={2.5}
            fill="url(#radar-dernier)"
            fillOpacity={1}
            dot={{ r: 3.5, fill: "#1C3A4B", stroke: "#F7EFDC", strokeWidth: 1.5 }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: "#5A6A62" }}
          />
        </RadarChart>
      </ResponsiveContainer>
      </div>

      {/* Alternative accessible au radar (lecteurs d'écran) */}
      <table className="sr-only">
        <caption>Profil joueur : dernier match vs moyenne des matchs</caption>
        <thead>
          <tr>
            <th scope="col">Statistique</th>
            <th scope="col">Dernier match</th>
            <th scope="col">Moyenne</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.stat}>
              <th scope="row">{d.stat}</th>
              <td>{d.lastVal}</td>
              <td>{d.avgVal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
