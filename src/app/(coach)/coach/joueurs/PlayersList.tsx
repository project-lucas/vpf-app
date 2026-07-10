"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Target } from "lucide-react";
import { formatPercent } from "@/lib/discipline";
import { AVAILABILITY_LABELS, LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import type { PlayerAvailability, SessionPole } from "@/lib/types";

const POLE_CHIPS: { pole: SessionPole; label: string }[] = [
  { pole: "basket", label: "Technique" },
  { pole: "physique", label: "Physique" },
  { pole: "routine", label: "Routine" },
];

export type PoleProgress = Record<SessionPole, { done: number; total: number }>;

export interface PlayerListItem {
  id: string;
  first_name: string;
  last_name: string;
  season_goal: string;
  availability: PlayerAvailability;
  discipline: number | null;
  progress: PoleProgress | null;
}

type SortKey = "name" | "discipline-asc" | "discipline-desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "A → Z" },
  { key: "discipline-asc", label: "Discipline ↑" },
  { key: "discipline-desc", label: "Discipline ↓" },
];

/** Liste des joueurs du coach : recherche par nom + tri par discipline. */
export function PlayersList({ players }: { players: PlayerListItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
      : players;
    if (sort === "name") return filtered; // déjà triés par prénom côté serveur
    // les joueurs sans score passent en fin de liste, quel que soit le sens
    return [...filtered].sort((a, b) => {
      if (a.discipline === null) return 1;
      if (b.discipline === null) return -1;
      return sort === "discipline-asc"
        ? a.discipline - b.discipline
        : b.discipline - a.discipline;
    });
  }, [players, query, sort]);

  return (
    <>
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-300"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un joueur…"
            className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-9 pr-3.5 text-sm focus:border-navy-600 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`flex-1 rounded-xl px-1 py-1.5 text-xs font-bold transition-colors ${
                sort === s.key
                  ? "bg-navy-800 text-white"
                  : "border border-navy-200 bg-white text-navy-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-navy-400">
          Aucun joueur ne correspond à « {query} ».
        </p>
      ) : (
        <div className="space-y-2.5">
          {shown.map((p) => (
            <Link
              key={p.id}
              href={`/coach/joueurs/${p.id}`}
              className="block rounded-2xl border border-navy-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-navy-900">
                  {p.first_name} {p.last_name}
                  {p.availability !== "available" && (
                    <span
                      className={`ml-1.5 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${
                        p.availability === "injured"
                          ? "bg-danger-soft text-danger"
                          : "bg-navy-100 text-navy-600"
                      }`}
                    >
                      {AVAILABILITY_LABELS[p.availability]}
                    </span>
                  )}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold ${
                    p.discipline === null
                      ? "bg-navy-100 text-navy-400"
                      : p.discipline < LOW_DISCIPLINE_THRESHOLD
                        ? "bg-danger-soft text-danger"
                        : "bg-success-soft text-success"
                  }`}
                >
                  {formatPercent(p.discipline)}
                </span>
              </div>
              {p.season_goal && (
                <p className="mt-1 line-clamp-2 text-sm text-navy-400">
                  <Target size={12} className="-mt-0.5 inline" /> {p.season_goal}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {POLE_CHIPS.map(({ pole, label }) => {
                  const stats = p.progress?.[pole];
                  const empty = !stats || stats.total === 0;
                  const complete = !empty && stats.done === stats.total;
                  return (
                    <span
                      key={pole}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        empty
                          ? "bg-navy-50 text-navy-300"
                          : complete
                            ? "bg-success-soft text-success"
                            : "bg-navy-100 text-navy-600"
                      }`}
                    >
                      {label} {empty ? "—" : `${stats.done}/${stats.total}`}
                    </span>
                  );
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
