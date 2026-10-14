"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { WeeklyReviewForm } from "@/components/planning/WeeklyReviewForm";

/**
 * Le bilan de la semaine en pop-up bloquant (0043) : dès le dimanche 18 h,
 * puis tant qu'il manque, l'écran joueur s'ouvre dessus et ne se ferme pas
 * sans lui. Pas de croix, pas d'Échap, pas de clic à côté : on remplit, et on
 * passe à la suite. Le formulaire est celui du planning.
 */
export function ReviewGate({
  weekStart,
  weekLabel,
  isCatchUp,
}: {
  weekStart: string;
  weekLabel: string;
  isCatchUp: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Modal
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          <ClipboardList size={22} className="text-orange" />
          Bilan de la semaine
        </span>
      }
      variant="retro"
    >
      <p className="ed-meta mb-3 text-[11px] leading-relaxed text-meta">
        {isCatchUp
          ? `Le bilan de la semaine ${weekLabel} n'a pas été rempli. Prends deux minutes avant de continuer : ce que tu as bien fait, ce que tu veux améliorer, et comment va ton corps.`
          : `Semaine ${weekLabel}. C'est l'heure du bilan : ce que tu as bien fait, ce que tu veux améliorer, et comment va ton corps. Ton coach te répond ensuite.`}
      </p>
      <WeeklyReviewForm
        initialWentWell=""
        initialToImprove=""
        initialHealthStatus=""
        initialHealthNote=""
        weekStart={weekStart}
        onDone={() => setOpen(false)}
      />
    </Modal>
  );
}
