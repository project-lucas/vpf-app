"use client";

import { useState, useTransition } from "react";
import { Trophy } from "lucide-react";
import { answerMatchWeekend } from "@/app/actions/player";
import { Modal } from "@/components/ui/Modal";
import { MatchStatForm } from "@/app/(player)/dashboard/MatchStatForm";
import { parisNow } from "@/lib/dates";
import type { DueMatch, MatchWeekendAnswer } from "@/lib/player-gates";

/**
 * La feuille de match du week-end en pop-up (0044) : dès le samedi 18 h,
 * l'écran joueur s'ouvre sur ses stats à saisir. Pas de croix, mais trois
 * sorties honnêtes en bas : « Je n'ai pas joué », « Mon match est demain »
 * (le pop-up revient le dimanche 18 h, avec le bilan) et « Pas de match ce
 * week-end ». Chaque réponse est enregistrée : on ne redemande pas.
 */
export function MatchGate({ due, onDone }: { due: DueMatch; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = parisNow().date;

  function answer(value: MatchWeekendAnswer) {
    setError(null);
    startTransition(async () => {
      const result = await answerMatchWeekend(due.weekStart, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  const choice =
    "ed-meta w-full rounded-md border-2 border-ink/30 px-3 py-2.5 text-[11px] text-meta transition-colors hover:border-ink hover:text-ink disabled:opacity-60";

  return (
    <Modal
      open
      title={
        <span className="inline-flex items-center gap-2">
          <Trophy size={22} className="text-orange" />
          Ta feuille de match
        </span>
      }
      variant="retro"
    >
      <p className="ed-meta mb-3 text-[11px] leading-relaxed text-meta">
        {due.deferred
          ? "Tu nous avais dit que ton match était aujourd'hui : remplis ta feuille maintenant, une minute suffit."
          : "C'est le week-end ! Si tu as joué, remplis ta feuille de match : minutes, tirs, lancers francs. Sinon, dis-nous où tu en es juste en dessous."}
      </p>
      <MatchStatForm
        initialDate={today <= due.sunday ? today : due.sunday}
        minDate={due.saturday}
        onSuccess={onDone}
      />
      {error && (
        <p className="ed-meta mt-3 rounded-md border-2 border-orange px-3 py-2 text-[11px] text-orange">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-2 border-t-2 border-ink/15 pt-4">
        <button type="button" onClick={() => answer("not_played")} disabled={isPending} className={choice}>
          Je n&apos;ai pas joué
        </button>
        {!due.isSunday && (
          <button type="button" onClick={() => answer("tomorrow")} disabled={isPending} className={choice}>
            Mon match est demain
          </button>
        )}
        <button type="button" onClick={() => answer("no_match")} disabled={isPending} className={choice}>
          Pas de match ce week-end
        </button>
      </div>
    </Modal>
  );
}
