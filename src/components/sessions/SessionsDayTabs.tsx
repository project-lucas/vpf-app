"use client";

import { useState } from "react";
import { POLE_LABELS, WEEKDAY_LABELS, WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { DumbbellIcon, RepeatIcon, TargetIcon } from "@/components/icons";
import { EditorialTabs } from "@/components/editorial/EditorialTabs";
import { IndexRow, Overline, SectionHead } from "@/components/editorial/primitives";
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

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Prochain jour de la semaine qui porte au moins une séance, à partir de `from`. */
function nextDayWithSessions(
  list: SessionAssignmentWithSession[],
  from: number
): number | null {
  for (let i = 0; i < 7; i++) {
    const day = ((from - 1 + i) % 7) + 1;
    if (list.some((a) => a.weekday === day)) return day;
  }
  return null;
}

/**
 * Programme du joueur, un JOUR à la fois (migration 0035).
 *
 * Le coach range chaque séance sur un jour de la semaine, comme les tâches du
 * planning : le joueur ouvre son programme et voit ce qu'il a à faire
 * aujourd'hui — sa prépa physique du lundi ne pollue pas son mercredi. Dans le
 * jour, les séances restent groupées par pôle (physique, technique, routine).
 *
 * Une séance se coche une fois pour toutes : le jour la range, il ne la fait
 * pas revenir chaque semaine.
 */
export function SessionsDayTabs({
  list,
  notes,
  todayWeekday,
  initialDay,
}: {
  list: SessionAssignmentWithSession[];
  notes: { pole: SessionPole; content: string }[];
  /** jour courant (heure de Paris), calculé par le serveur */
  todayWeekday: number;
  /** jour demandé par un lien (?jour=3, notification, planning) */
  initialDay?: number;
}) {
  // On ouvre sur aujourd'hui. Si rien n'est prévu aujourd'hui, on avance
  // jusqu'au prochain jour qui a des séances plutôt que d'afficher un écran
  // vide — le lien entrant (?jour=) reste prioritaire.
  const [day, setDay] = useState<number>(
    () => initialDay ?? nextDayWithSessions(list, todayWeekday) ?? todayWeekday
  );

  const dayList = list.filter((a) => a.weekday === day);
  const groups = POLE_ORDER.map((pole) => ({
    pole,
    items: dayList.filter((a) => a.session.pole === pole),
  })).filter((g) => g.items.length > 0);

  // numérotation continue sur la journée (01, 02, 03…) : le numéro dit dans
  // quel ordre enchaîner les séances du jour
  const numbers = new Map(
    groups.flatMap((g) => g.items).map((a, i) => [a.id, i + 1] as const)
  );
  const doneToday = dayList.filter(isDone).length;

  return (
    <div>
      <EditorialTabs
        active={String(day)}
        onChange={(k) => setDay(Number(k))}
        className="overflow-x-auto scrollbar-none"
        tabs={DAYS.map((d) => ({
          key: String(d),
          label: WEEKDAY_LABELS_SHORT[d - 1],
          count: list.filter((a) => a.weekday === d).length,
        }))}
      />

      {/* En-tête de section : index du jour · nom · avancement */}
      <div className="mt-5">
        <IndexRow
          index={String(day).padStart(2, "0")}
          label={
            day === todayWeekday
              ? `${WEEKDAY_LABELS[day - 1]} · aujourd'hui`
              : WEEKDAY_LABELS[day - 1]
          }
          value={
            <span className="text-orange">
              {doneToday}/{dayList.length}
            </span>
          }
          last
        />
      </div>

      {dayList.length === 0 ? (
        <div className="mt-4 rounded-md border-2 border-ink bg-card px-5 py-8 text-center">
          <p className="ed-display text-[22px] text-ink">Jour de repos</p>
          <p className="ed-meta mt-2 text-[10px] text-meta">
            Aucune séance prévue {WEEKDAY_LABELS[day - 1].toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {groups.map((g) => {
            const note = notes.find((n) => n.pole === g.pole)?.content;
            return (
              <section key={g.pole}>
                <SectionHead icon={POLE_ICONS[g.pole]}>
                  {POLE_SHORT[g.pole]} — {POLE_LABELS[g.pole]}
                </SectionHead>

                {note && (
                  <div className="mt-3 rounded-md border-2 border-ink bg-card p-3.5">
                    <Overline className="mb-1.5">Message de ton coach</Overline>
                    <p className="font-body text-sm leading-relaxed text-ink">{note}</p>
                  </div>
                )}

                <div className="mt-4 space-y-8">
                  {g.items.map((a) => (
                    <SessionCard key={a.id} assignment={a} index={numbers.get(a.id) ?? 0} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
