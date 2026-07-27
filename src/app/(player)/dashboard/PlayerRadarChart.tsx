"use client";

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
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
  threes_made: number;
  twos_inside_made: number;
  twos_outside_made: number;
  free_throws_made: number;
  fouls: number;
}

/**
 * Axes du radar avec un REPÈRE FIXE (max attendu sur un match) : l'aire garde
 * le même sens d'un match à l'autre. Temps de jeu plafonné à la durée d'un match
 * de basket (40 min), points à 40, etc.
 */
const AXES: { key: keyof RadarMatch; label: string; max: number }[] = [
  { key: "points", label: "Points", max: 40 },
  { key: "minutes", label: "Temps de jeu", max: 40 },
  { key: "threes_made", label: "3 pts", max: 10 },
  { key: "twos_inside_made", label: "2 pts int.", max: 15 },
  { key: "twos_outside_made", label: "2 pts ext.", max: 10 },
  { key: "free_throws_made", label: "Lancers francs", max: 12 },
];

// Comparaison dernier match vs précédent : les fautes sont « inversées »
// (en marquer plus est mauvais → rouge).
const COMPARE: { key: keyof RadarMatch; label: string; lowerIsBetter?: boolean }[] = [
  ...AXES.map((a) => ({ key: a.key, label: a.label })),
  { key: "fouls", label: "Fautes", lowerIsBetter: true },
];

interface RadarDatum {
  stat: string;
  moyenne: number;
  dernier: number;
  lastVal: number;
  avgVal: number;
  max: number;
}

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
      <p className="mb-1 font-bold text-ink">
        {d.stat} <span className="font-normal text-meta">/ {d.max}</span>
      </p>
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
 * Radar « Graphique Radar » : dernier match (contour plein) vs moyenne des
 * matchs (aire), chaque axe normalisé sur un repère FIXE. En dessous, la
 * comparaison au match précédent colore en vert ce qui progresse, en rouge ce
 * qui baisse (fautes inversées).
 */
export function PlayerRadar({ matches }: { matches: RadarMatch[] }) {
  if (matches.length === 0) return null;
  const last = matches[0];
  const prev = matches[1] ?? null;

  const data: RadarDatum[] = AXES.map((a) => {
    const avg = matches.reduce((sum, m) => sum + m[a.key], 0) / matches.length;
    return {
      stat: a.label,
      // normalisation sur le repère fixe, plafonnée à 100 %
      moyenne: Math.min(100, Math.round((avg / a.max) * 100)),
      dernier: Math.min(100, Math.round((last[a.key] / a.max) * 100)),
      lastVal: last[a.key],
      avgVal: Math.round(avg * 10) / 10,
      max: a.max,
    };
  });

  return (
    <div className="w-full">
      <div className="h-64 w-full" aria-hidden>
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

      {/* Comparaison au match précédent : vert = ça monte, rouge = ça baisse */}
      {prev && (
        <div className="mt-3">
          <p className="ed-overline mb-2">Vs match précédent</p>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPARE.map((c) => {
              const delta = last[c.key] - prev[c.key];
              const improved = c.lowerIsBetter ? delta < 0 : delta > 0;
              const worsened = c.lowerIsBetter ? delta > 0 : delta < 0;
              const color = improved
                ? "text-success"
                : worsened
                  ? "text-danger"
                  : "text-meta";
              const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : ArrowRight;
              return (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-2 rounded-md bg-tan px-2.5 py-1.5"
                >
                  <span className="truncate text-[11px] font-semibold text-meta">{c.label}</span>
                  <span className={`flex items-center gap-1 text-[12px] font-bold ${color}`}>
                    <Icon size={13} strokeWidth={2.5} />
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alternative accessible au radar (lecteurs d'écran) */}
      <table className="sr-only">
        <caption>Profil joueur : dernier match vs moyenne des matchs (repère max entre parenthèses)</caption>
        <thead>
          <tr>
            <th scope="col">Statistique</th>
            <th scope="col">Dernier match</th>
            <th scope="col">Moyenne</th>
            <th scope="col">Repère</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.stat}>
              <th scope="row">{d.stat}</th>
              <td>{d.lastVal}</td>
              <td>{d.avgVal}</td>
              <td>{d.max}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
