"use client";

import { useState } from "react";
import { CATEGORIES, POLE_LABELS } from "@/lib/constants";
import { DumbbellIcon, RepeatIcon, TargetIcon } from "@/components/icons";
import { EditorialTabs } from "@/components/editorial/EditorialTabs";
import { IndexRow, Overline } from "@/components/editorial/primitives";
import { SessionCard } from "./SessionCard";
import type { SessionAssignmentWithSession, SessionPole } from "@/lib/types";

const POLE_ORDER: SessionPole[] = ["physique", "basket", "routine"];
const POLE_SHORT: Record<SessionPole, string> = {
  physique: "Physique",
  basket: "Technique",
  routine: "Routine",
};
const POLE_ICONS: Record<SessionPole, React.ReactNode> = {
  physique: <DumbbellIcon size={14} />,
  basket: <TargetIcon size={14} />, // Technique = cible (le ballon fait globe en petit)
  routine: <RepeatIcon size={14} />,
};

const isDone = (a: SessionAssignmentWithSession) => a.completion?.status === "done";

/**
 * Rang de tri d'une séance dans son pôle : sa catégorie la plus haute dans
 * CATEGORIES (une séance physique peut en porter plusieurs). Les catégories
 * inconnues passent en fin de liste.
 */
function categoryRank(pole: SessionPole, categories: string[]): number {
  const ranks = categories
    .map((c) => CATEGORIES[pole].indexOf(c))
    .filter((i) => i >= 0);
  return ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}

/**
 * Onglets Physique / Technique / Routine (langage Éditorial Sport) : une seule
 * catégorie affichée à la fois.
 */
export function SessionsPoleTabs({
  list,
  notes,
}: {
  list: SessionAssignmentWithSession[];
  notes: { pole: SessionPole; content: string }[];
}) {
  // ouvre directement la première catégorie qui a des séances
  const [pole, setPole] = useState<SessionPole>(
    () => POLE_ORDER.find((p) => list.some((a) => a.session.pole === p)) ?? "physique"
  );

  const poleList = list
    .filter((a) => a.session.pole === pole)
    .sort(
      (a, b) =>
        categoryRank(pole, a.session.categories ?? []) -
        categoryRank(pole, b.session.categories ?? [])
    );
  const note = notes.find((n) => n.pole === pole)?.content;
  const doneInPole = poleList.filter(isDone).length;
  const sectionIndex = String(POLE_ORDER.indexOf(pole) + 1).padStart(2, "0");

  return (
    <div>
      <EditorialTabs
        active={pole}
        onChange={(k) => setPole(k as SessionPole)}
        tabs={POLE_ORDER.map((p) => ({
          key: p,
          label: POLE_SHORT[p],
          icon: POLE_ICONS[p],
          count: list.filter((a) => a.session.pole === p).length,
        }))}
      />

      {/* En-tête de section : index · pôle · avancement */}
      <div className="mt-5">
        <IndexRow
          index={sectionIndex}
          label={POLE_LABELS[pole]}
          value={
            <span className="text-orange">
              {doneInPole}/{poleList.length}
            </span>
          }
          last
        />
      </div>

      {note && (
        <div className="mt-3 rounded-md border-2 border-ink bg-card p-3.5">
          <Overline className="mb-1.5">Message de ton coach</Overline>
          <p className="font-body text-sm leading-relaxed text-ink">{note}</p>
        </div>
      )}

      {poleList.length === 0 ? (
        <div className="mt-4 rounded-md border-2 border-ink bg-card px-5 py-8 text-center">
          <p className="ed-display text-[22px] text-ink">Rien ici</p>
          <p className="ed-meta mt-2 text-[10px] text-meta">
            Ton coach n&apos;a pas encore rendu de séance visible ici.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          {poleList.map((a, i) => (
            <SessionCard key={a.id} assignment={a} index={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
