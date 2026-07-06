"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ProgressPoint {
  /** lundi de la semaine, format "dd/MM" */
  label: string;
  technique: number;
  physique: number;
  vie: number;
  total: number;
  /** semaine où au moins un record perso est tombé */
  recordDot: number | null;
}

const DIMS = [
  { key: "technique", label: "Technique", color: "#C0392B" },
  { key: "physique", label: "Physique", color: "#1C3A4B" },
  { key: "vie", label: "Vie & habitudes", color: "#E8A87C" },
] as const;

/**
 * Courbe de croissance de la saison : XP cumulés semaine par semaine, empilés
 * par dimension (technique basket / physique / vie & habitudes). Elle ne peut
 * que monter — chaque action validée la fait grimper. Les points dorés
 * marquent les semaines où un record perso est tombé.
 */
export function ProgressChart({ data, weekGain }: { data: ProgressPoint[]; weekGain: number }) {
  // dimensions masquées via les chips-filtres : cliquer isole/cache une courbe
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (data.length === 0) return null;
  const last = data[data.length - 1];
  const hasRecords = data.some((d) => d.recordDot !== null);
  const visibleDims = DIMS.filter((d) => !hidden.has(d.key));

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="ed-value text-4xl leading-none text-ink">
          {last.total}
        </span>
        <span className="text-xs font-medium text-meta">
          XP cette saison
          {weekGain > 0 && (
            <span className="ml-1.5 font-bold text-orange">+{weekGain} cette semaine</span>
          )}
        </span>
      </div>

      {/* Chips-filtres : décomposent le total ET permettent d'isoler/cacher
          chaque courbe d'un clic */}
      <div className="mb-3 mt-2.5 flex flex-wrap gap-1.5">
        {DIMS.map((d) => {
          const off = hidden.has(d.key);
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => toggle(d.key)}
              aria-pressed={!off}
              title={off ? `Afficher ${d.label}` : `Masquer ${d.label}`}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 py-1 pl-2 pr-2.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                off
                  ? "border-ink/30 bg-transparent text-muted"
                  : "border-ink bg-tan text-ink"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full transition-opacity"
                style={{ backgroundColor: d.color, opacity: off ? 0.3 : 1 }}
              />
              {d.label}
              <span className={`tabular-nums ${off ? "text-muted" : "text-meta"}`}>
                {last[d.key]}
              </span>
            </button>
          );
        })}
        {hasRecords && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warm/25 py-1 pl-2 pr-2.5 text-[11px] font-bold text-orange">
            <span className="h-2 w-2 rounded-full bg-warm ring-2 ring-card" />
            Record battu
          </span>
        )}
      </div>

      <div className="h-52 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <defs>
              {DIMS.map((d) => (
                <linearGradient key={d.key} id={`grad-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={d.color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={d.color} stopOpacity={0.04} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(28,58,75,0.2)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#5A6A62", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(28,58,75,0.2)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#5A6A62", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value, name) => [
                `${value} XP`,
                name === "technique"
                  ? "Technique"
                  : name === "physique"
                    ? "Physique"
                    : name === "vie"
                      ? "Vie & habitudes"
                      : "Record battu",
              ]}
              labelFormatter={(label) => `Semaine du ${label}`}
              contentStyle={{
                borderRadius: 6,
                border: "2px solid #1C3A4B",
                backgroundColor: "#F7EFDC",
                fontSize: 12,
              }}
            />
            {visibleDims.map((d) => (
              <Area
                key={d.key}
                type="monotone"
                dataKey={d.key}
                stackId="xp"
                stroke={d.color}
                strokeWidth={2.5}
                fill={`url(#grad-${d.key})`}
                name={d.key}
              />
            ))}
            {/* semaines à record : point doré posé sur le sommet de la courbe */}
            <Line
              type="monotone"
              dataKey="recordDot"
              stroke="none"
              dot={{ r: 5, fill: "#E8A87C", stroke: "#F7EFDC", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              name="record"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        Chaque action validée fait grimper ta courbe — elle ne redescend jamais.
      </p>

      {/* Alternative accessible au graphe (lecteurs d'écran) */}
      <table className="sr-only">
        <caption>XP cumulés par jour et par dimension</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Technique</th>
            <th scope="col">Physique</th>
            <th scope="col">Vie &amp; habitudes</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.technique}</td>
              <td>{d.physique}</td>
              <td>{d.vie}</td>
              <td>{d.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
