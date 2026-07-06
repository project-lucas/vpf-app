"use client";

import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { WeeklyReviewForm } from "./WeeklyReviewForm";

/**
 * Pastille « Bilan de la semaine » (bas de la page planning). Un point
 * d'interrogation jaune apparaît le week-end tant que ni le bilan ni la feuille
 * de match n'ont été remplis (`remind`), pour inciter le joueur à le faire.
 */
export function WeeklyReviewLauncher({
  hasReview,
  remind,
  initialWentWell,
  initialToImprove,
}: {
  hasReview: boolean;
  remind: boolean;
  initialWentWell: string;
  initialToImprove: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bilan de la semaine"
        className={`relative inline-flex items-center gap-1.5 rounded-md border-2 px-3 py-2 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
          hasReview ? "border-ink/30 bg-transparent text-meta" : "border-ink bg-tan text-ink"
        }`}
      >
        {hasReview ? <Check size={15} /> : <ClipboardList size={15} />}
        Bilan de la semaine
        {remind && <ReminderMark />}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Bilan de la semaine" variant="retro">
        <p className="ed-meta mb-3 text-[11px] leading-relaxed text-meta">
          Prends deux minutes chaque dimanche : ce que tu as bien fait, ce que tu veux améliorer.
        </p>
        <WeeklyReviewForm
          initialWentWell={initialWentWell}
          initialToImprove={initialToImprove}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
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
