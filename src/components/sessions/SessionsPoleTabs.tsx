"use client";

import { useState } from "react";
import { CATEGORIES, POLE_LABELS } from "@/lib/constants";
import { XP_VALUES } from "@/lib/gamification";
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
 * Onglets Physique / Technique / Routine (langage Éditorial Sport) : une seule
 * catégorie affichée à la fois, avec relance XP et renvoi vers les autres pôles.
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
        CATEGORIES[pole].indexOf(a.session.category) -
        CATEGORIES[pole].indexOf(b.session.category)
    );
  const note = notes.find((n) => n.pole === pole)?.content;
  const doneInPole = poleList.filter(isDone).length;
  const pendingInPole = poleList.length - doneInPole;
  const sectionIndex = String(POLE_ORDER.indexOf(pole) + 1).padStart(2, "0");

  // Renvoi : le pôle (autre que courant) avec le plus de séances à faire
  const suggestion = POLE_ORDER.filter((p) => p !== pole)
    .map((p) => {
      const sessions = list.filter((a) => a.session.pole === p);
      return { pole: p, pending: sessions.filter((a) => !isDone(a)).length };
    })
    .filter((s) => s.pending > 0)
    .sort((a, b) => b.pending - a.pending)[0];

  const todayXp = pendingInPole * XP_VALUES.sessionDone;

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

      {/* Renvoi vers un autre pôle qui a des séances à faire */}
      {suggestion && (
        <button
          onClick={() => setPole(suggestion.pole)}
          className="mt-6 flex w-full items-center gap-4 rounded-md border-2 border-ink bg-card px-4 py-3.5 text-left transition-colors hover:bg-ink/5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink">
            <span className="ed-value text-base text-warm">+{suggestion.pending * XP_VALUES.sessionDone}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="ed-value block text-base text-ink">
              {suggestion.pending} séance{suggestion.pending > 1 ? "s" : ""}{" "}
              {POLE_SHORT[suggestion.pole].toLowerCase()}
            </span>
            <span className="ed-meta block text-[9px] text-meta">
              Onglet {POLE_SHORT[suggestion.pole]} — XP à la clé
            </span>
          </span>
          <span aria-hidden className="ed-value shrink-0 text-2xl text-orange">
            ›
          </span>
        </button>
      )}

      {/* Relance XP du jour */}
      <div className="mt-8 text-center">
        {pendingInPole > 0 ? (
          <p className="ed-display text-[26px] text-orange">+{todayXp} XP aujourd&apos;hui</p>
        ) : (
          <p className="ed-display text-[26px] text-ink">Séances validées</p>
        )}
        <p className="ed-meta mt-1.5 text-[10px] text-meta">
          {pendingInPole > 0
            ? "Termine ta séance pour débloquer"
            : "Bien joué — reviens demain"}
        </p>
      </div>
    </div>
  );
}
