"use client";

import { useState } from "react";
import { ReviewGate } from "@/components/ReviewGate";
import { MatchGate } from "@/components/MatchGate";
import type { DueMatch, DueReview } from "@/lib/player-gates";

/**
 * Les portes de l'espace joueur, une à la fois : le bilan de la semaine,
 * puis la feuille de match. Le dimanche 18 h, les deux peuvent attendre
 * (« mon match est demain ») : la seconde s'ouvre dès que la première est
 * remplie, sans attendre que le serveur re-rende le gabarit.
 */
export function PlayerGates({ review, match }: { review: DueReview | null; match: DueMatch | null }) {
  const [reviewDone, setReviewDone] = useState(false);
  const [matchDone, setMatchDone] = useState(false);

  if (review && !reviewDone) {
    return (
      <ReviewGate
        key={review.weekStart}
        weekStart={review.weekStart}
        weekLabel={review.weekLabel}
        isCatchUp={review.isCatchUp}
        onDone={() => setReviewDone(true)}
      />
    );
  }
  if (match && !matchDone) {
    return <MatchGate key={match.weekStart} due={match} onDone={() => setMatchDone(true)} />;
  }
  return null;
}
