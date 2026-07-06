import { Timer } from "lucide-react";
import type { SessionChallenge, SessionExercise } from "@/lib/types";

/**
 * Détail d'une séance programme : intro, exercices chronométrés (le tag
 * « ARME » signale l'exercice signature du poste) et challenge noté.
 */
export function SessionProgramme({
  intro,
  exercises,
  challenge,
}: {
  intro: string;
  exercises: SessionExercise[];
  challenge: SessionChallenge | null;
}) {
  return (
    <div className="space-y-2.5">
      {intro && <p className="text-xs italic leading-relaxed text-navy-500">{intro}</p>}

      {exercises.map((ex) => (
        <div key={ex.order} className="rounded-xl border border-navy-100 bg-navy-50 p-3">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-navy-900">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[10px] leading-none text-white">
              {ex.order}
            </span>
            <span>{ex.title}</span>
            <span className="text-[11px] font-semibold text-navy-400">
              <Timer size={11} className="-mt-0.5 inline" /> {ex.durationMinutes} min
            </span>
            {ex.tag && (
              <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
                {ex.tag}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-navy-600">{ex.description}</p>
        </div>
      ))}

      {challenge && (
        <div className="rounded-xl bg-navy-900 p-3 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-warning-soft">
            Challenge noté
            {challenge.durationMinutes ? ` · ${challenge.durationMinutes} min` : ""}
          </p>
          <p className="mt-0.5 text-sm font-bold">« {challenge.title} »</p>
          <p className="mt-1 text-xs leading-relaxed text-navy-200">{challenge.description}</p>
        </div>
      )}
    </div>
  );
}
