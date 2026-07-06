"use client";

import { useState } from "react";
import { EdButton } from "@/components/editorial/forms";
import { CheckIcon } from "@/components/icons";
import { WeeklyReviewForm } from "./WeeklyReviewForm";

/** Bilan hebdo replié par défaut : titre + badge ✓ si déjà rempli, bouton pour déplier. */
export function WeeklyReviewCard({
  hasReview,
  initialWentWell,
  initialToImprove,
}: {
  hasReview: boolean;
  initialWentWell: string;
  initialToImprove: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="ed-value text-lg text-ink">Bilan de la semaine</h2>
        {hasReview && (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warm/25 text-orange"
            title="Bilan enregistré cette semaine"
          >
            <CheckIcon size={12} />
          </span>
        )}
      </div>
      {open ? (
        <WeeklyReviewForm initialWentWell={initialWentWell} initialToImprove={initialToImprove} />
      ) : (
        <EdButton variant="ghost" full onClick={() => setOpen(true)}>
          Faire mon bilan
        </EdButton>
      )}
    </>
  );
}
