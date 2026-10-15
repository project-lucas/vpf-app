"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { JarvisAvatar } from "@/components/coach/JarvisAvatar";
import { formatAgoFr } from "@/lib/dates";
import { MEMORY_SECTIONS, type PlayerMemory } from "@/lib/player-memory";

/**
 * La fiche mémoire en tête de la fiche joueur : cinq lignes tenues à jour par
 * Jarvis chaque semaine — de quoi reprendre le joueur en 30 secondes.
 *
 * Ordinateur : ouverte. Téléphone : repliée sur une ligne (« Où il en est »),
 * pour que les messages, juste en dessous, se voient sans défiler ; un geste
 * la déplie. Staff seulement.
 */
export function PlayerMemoryCard({ memory }: { memory: PlayerMemory | null }) {
  const [open, setOpen] = useState(false);

  // ouverte d'office sur grand écran, repliée sur téléphone
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setOpen(true);
  }, []);

  if (!memory) {
    return (
      <p className="mb-3 flex items-center gap-2 text-[12px] text-navy-400 sm:mb-4">
        <JarvisAvatar size={20} />
        Pas encore de fiche mémoire : Jarvis la rédigera à son prochain passage.
      </p>
    );
  }
  const lines = MEMORY_SECTIONS.filter((s) => memory.sections[s.key]?.trim());
  const teaser = memory.sections.situation || (lines[0] ? memory.sections[lines[0].key] : "") || "";

  return (
    <section className="mb-3 rounded-2xl border border-navy-100 bg-white px-3.5 py-2.5 sm:mb-5 sm:px-4 sm:py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <JarvisAvatar size={24} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-navy-400">
              Fiche mémoire
            </span>
            <span className="truncate text-[11px] text-navy-300">· {formatAgoFr(memory.updated_at)}</span>
          </span>
          {!open && teaser && (
            <span className="mt-0.5 block truncate text-[12.5px] text-navy-700">{teaser}</span>
          )}
        </span>
        <ChevronDown
          size={17}
          aria-hidden
          className={`shrink-0 text-navy-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <dl className="mt-2.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {lines.map((s) => (
            <div key={s.key} className={s.key === "situation" ? "sm:col-span-2" : ""}>
              <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent">{s.label}</dt>
              <dd className="text-[13.5px] leading-snug text-navy-800">{memory.sections[s.key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
