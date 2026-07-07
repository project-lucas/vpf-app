"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { submitWeeklyReview } from "@/app/actions/player";
import { EdButton, EdField, EdTextarea } from "@/components/editorial/forms";

export function WeeklyReviewForm({
  initialWentWell,
  initialToImprove,
  onDone,
}: {
  initialWentWell: string;
  initialToImprove: string;
  /** appelé après un enregistrement réussi (ex. fermeture de la modale) */
  onDone?: () => void;
}) {
  const [wentWell, setWentWell] = useState(initialWentWell);
  const [toImprove, setToImprove] = useState(initialToImprove);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await submitWeeklyReview(wentWell, toImprove);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <EdField label="Qu'as-tu bien fait cette semaine ?">
        <EdTextarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          placeholder="Tes points forts de la semaine…"
        />
      </EdField>
      <EdField label="Que dois-tu améliorer ?">
        <EdTextarea
          value={toImprove}
          onChange={(e) => setToImprove(e.target.value)}
          placeholder="Tes axes de progression…"
        />
      </EdField>
      {error && <p className="text-sm font-medium text-orange">{error}</p>}
      <EdButton type="submit" full variant="navy" disabled={loading}>
        {loading ? (
          "Enregistrement…"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Check size={15} /> Enregistrer mon bilan
          </span>
        )}
      </EdButton>
    </form>
  );
}
