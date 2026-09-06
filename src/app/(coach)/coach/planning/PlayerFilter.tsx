"use client";

import { useRouter } from "next/navigation";

/**
 * Filtre par joueur du planning : un sélecteur, à la place d'une pastille par
 * joueur — huit pastilles à faire défiler pour en cocher une, c'était le
 * contraire d'un filtre.
 */
export function PlayerFilter({
  players,
  selected,
  weekStart,
}: {
  players: { id: string; name: string }[];
  selected: string | null;
  weekStart: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        router.push(`/coach/planning?w=${weekStart}${id ? `&j=${id}` : ""}`);
      }}
      aria-label="Filtrer par joueur"
      className="w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm font-semibold text-navy-800 focus:border-navy-600 focus:outline-none"
    >
      <option value="">Tous les joueurs</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
