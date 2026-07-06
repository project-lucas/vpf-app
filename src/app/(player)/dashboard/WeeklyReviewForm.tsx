"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { submitWeeklyReview } from "@/app/actions/player";
import { EdButton, EdField, EdTextarea } from "@/components/editorial/forms";

export function WeeklyReviewForm({
  initialWentWell,
  initialToImprove,
}: {
  initialWentWell: string;
  initialToImprove: string;
}) {
  const router = useRouter();
  const [wentWell, setWentWell] = useState(initialWentWell);
  const [toImprove, setToImprove] = useState(initialToImprove);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);
    const result = await submitWeeklyReview(wentWell, toImprove);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
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
      {saved && (
        <p className="flex items-center gap-1 text-sm font-semibold text-ink">
          <Check size={14} /> Bilan enregistré
        </p>
      )}
      <EdButton type="submit" full variant="navy" disabled={loading}>
        {loading ? "Enregistrement…" : "Enregistrer mon bilan"}
      </EdButton>
    </form>
  );
}
