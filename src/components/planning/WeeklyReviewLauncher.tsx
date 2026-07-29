"use client";

import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CheckIcon } from "@/components/icons";
import { Overline } from "@/components/editorial/primitives";
import { WeeklyReviewForm } from "./WeeklyReviewForm";
import type { ReviewHealthStatus } from "@/lib/types";

/** Contenu du bilan de la semaine en cours, partagé par la pastille et la carte fixe. */
export interface WeeklyReviewState {
  hasReview: boolean;
  initialWentWell: string;
  initialToImprove: string;
  initialHealthStatus: ReviewHealthStatus;
  initialHealthNote: string;
}

/** Modale du bilan — même formulaire quelle que soit la porte d'entrée. */
function ReviewModal({
  open,
  onClose,
  review,
}: {
  open: boolean;
  onClose: () => void;
  review: WeeklyReviewState;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Bilan de la semaine" variant="retro">
      <p className="ed-meta mb-3 text-[11px] leading-relaxed text-meta">
        Prends deux minutes chaque dimanche : ce que tu as bien fait, ce que tu veux
        améliorer, et comment va ton corps.
      </p>
      <WeeklyReviewForm
        initialWentWell={review.initialWentWell}
        initialToImprove={review.initialToImprove}
        initialHealthStatus={review.initialHealthStatus}
        initialHealthNote={review.initialHealthNote}
        onDone={onClose}
      />
    </Modal>
  );
}

/**
 * Pastille « Bilan de la semaine » (bas de la page planning). Un point
 * d'interrogation jaune apparaît le week-end tant que ni le bilan ni la feuille
 * de match n'ont été remplis (`remind`), pour inciter le joueur à le faire.
 */
export function WeeklyReviewLauncher({
  review,
  remind,
}: {
  review: WeeklyReviewState;
  remind: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bilan de la semaine"
        className={`relative inline-flex items-center gap-1.5 rounded-md border-2 px-3 py-2 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
          review.hasReview ? "border-ink/30 bg-transparent text-meta" : "border-ink bg-tan text-ink"
        }`}
      >
        {review.hasReview ? <Check size={15} /> : <ClipboardList size={15} />}
        Bilan de la semaine
        {remind && <ReminderMark />}
      </button>

      <ReviewModal open={open} onClose={() => setOpen(false)} review={review} />
    </>
  );
}

/**
 * Rendez-vous FIXE du dimanche dans le planning : le bilan de la semaine,
 * 18 h, toutes offres confondues (perf et formation). Ce n'est pas un
 * événement de la semaine type — le joueur ne peut ni le déplacer ni le
 * supprimer, il revient chaque dimanche.
 */
export function WeeklyReviewFixedCard({
  review,
  nowMinutes,
  isToday,
}: {
  review: WeeklyReviewState;
  /** minutes écoulées depuis minuit (heure de Paris) — pour le rappel dès 18 h */
  nowMinutes: number;
  /** on est dimanche : le rappel ne pulse que le jour même */
  isToday: boolean;
}) {
  const [open, setOpen] = useState(false);
  const done = review.hasReview;

  // dès 18 h le dimanche, tant que rien n'est rempli, la carte se signale
  const remind = isToday && !done && nowMinutes >= 18 * 60;

  return (
    <div className="mb-5">
      <Overline className="mb-2">Rendez-vous du dimanche</Overline>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center gap-3 rounded-md border-2 px-3 py-3 text-left transition-colors ${
          done
            ? "border-ink/30 bg-transparent"
            : "border-ink bg-tan/50 hover:bg-tan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
        }`}
      >
        <span
          aria-hidden
          className={`shrink-0 ${done ? "text-meta" : "text-orange"} ${
            remind ? "animate-flame-pulse" : ""
          }`}
        >
          <ClipboardList size={20} />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`ed-value block truncate text-lg ${
              done ? "text-muted line-through" : "text-ink"
            }`}
          >
            Bilan de la semaine
          </span>
          <span className="ed-meta block text-[9px] text-meta">
            {done
              ? "Bilan envoyé — tu peux encore le compléter"
              : "18 h 00 · bien fait, à améliorer, ton corps — 2 minutes"}
          </span>
        </span>

        <span
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 ${
            done ? "border-ink/30 text-meta" : "border-ink bg-ink text-paper"
          }`}
        >
          {done ? <CheckIcon size={18} /> : <span className="ed-value text-sm">?</span>}
          {remind && (
            <span
              aria-hidden
              className="animate-pulse absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-ink bg-[#F5C518]"
            />
          )}
        </span>
      </button>

      <ReviewModal open={open} onClose={() => setOpen(false)} review={review} />
    </div>
  );
}

/** Point d'interrogation jaune de rappel (week-end), posé en coin de la pastille. */
export function ReminderMark() {
  return (
    <span
      aria-hidden
      className="animate-pulse absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink bg-[#F5C518] text-[11px] font-black text-ink shadow"
    >
      ?
    </span>
  );
}
