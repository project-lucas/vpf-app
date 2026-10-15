"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export interface SearchablePlayer {
  id: string;
  name: string;
  /** « Groupe A · Perf » : de quoi distinguer deux homonymes */
  hint: string;
}

const MAX_RESULTS = 8;

/** Sans accents ni majuscules : « theo » trouve « Théo ». */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * La loupe de l'accueil : trouver un joueur par son nom et ouvrir sa fiche,
 * sans passer par la liste. Entrée ouvre le premier résultat.
 */
export function PlayerSearch({ players }: { players: SearchablePlayer[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = fold(query.trim());
  const results = needle
    ? players.filter((p) => fold(p.name).split(/\s+/).some((w) => w.startsWith(needle)) || fold(p.name).includes(needle))
    : players;
  const shown = results.slice(0, MAX_RESULTS);

  const go = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/coach/joueurs/${id}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chercher un joueur"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sand bg-white text-navy-700 shadow-[0_8px_20px_-14px_rgba(15,42,74,0.4)] transition-colors hover:bg-cream/60 hover:text-navy-900"
      >
        <Search size={19} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Chercher un joueur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (shown[0]) go(shown[0].id);
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom ou prénom"
            aria-label="Nom ou prénom du joueur"
            className="w-full rounded-xl border border-navy-100 bg-white px-3.5 py-2.5 text-[15px] text-navy-900 focus:border-accent focus:outline-none"
          />
        </form>
        <ul className="mt-3 max-h-[50vh] divide-y divide-navy-50 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => go(p.id)}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-cream/60"
              >
                <span className="truncate text-[14.5px] font-semibold text-navy-900">{p.name}</span>
                <span className="shrink-0 text-[12px] text-navy-400">{p.hint}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-3 text-[13px] text-navy-400">Aucun joueur à ce nom.</li>}
        </ul>
        {results.length > MAX_RESULTS && (
          <p className="mt-2 text-[12px] text-navy-400">
            {results.length - MAX_RESULTS} autre{results.length - MAX_RESULTS > 1 ? "s" : ""} : précise le nom.
          </p>
        )}
      </Modal>
    </>
  );
}
