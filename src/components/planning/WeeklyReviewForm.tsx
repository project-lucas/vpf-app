"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { submitWeeklyReview } from "@/app/actions/player";
import { REVIEW_HEALTH_LABELS, REVIEW_HEALTH_NOTE_MAX_LENGTH } from "@/lib/constants";
import { EdButton, EdField, EdTextarea } from "@/components/editorial/forms";
import type { ReviewHealthStatus } from "@/lib/types";

const HEALTH_CHOICES = Object.entries(REVIEW_HEALTH_LABELS) as [
  Exclude<ReviewHealthStatus, "">,
  string,
][];

export function WeeklyReviewForm({
  initialWentWell,
  initialToImprove,
  initialHealthStatus,
  initialHealthNote,
  onDone,
}: {
  initialWentWell: string;
  initialToImprove: string;
  initialHealthStatus: ReviewHealthStatus;
  initialHealthNote: string;
  /** appelé après un enregistrement réussi (ex. fermeture de la modale) */
  onDone?: () => void;
}) {
  const [wentWell, setWentWell] = useState(initialWentWell);
  const [toImprove, setToImprove] = useState(initialToImprove);
  const [healthStatus, setHealthStatus] = useState<ReviewHealthStatus>(initialHealthStatus);
  const [healthNote, setHealthNote] = useState(initialHealthNote);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!healthStatus) {
      setError("Indique comment va ton corps cette semaine.");
      return;
    }
    setLoading(true);
    const result = await submitWeeklyReview(wentWell, toImprove, healthStatus, healthNote);
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

      {/* Question santé : blessure / gêne / tout va bien — l'info que le coach
          attend chaque semaine pour adapter la charge */}
      <div>
        <p className="ed-overline mb-1.5">Comment va ton corps cette semaine ?</p>
        <div className="grid grid-cols-3 gap-1.5">
          {HEALTH_CHOICES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setHealthStatus(value)}
              aria-pressed={healthStatus === value}
              className={`ed-value rounded-md border-2 px-1 py-2.5 text-[13px] transition-all active:scale-95 ${
                healthStatus === value
                  ? value === "ok"
                    ? "border-ink bg-ink text-paper"
                    : "border-orange bg-orange text-paper"
                  : "border-ink/25 bg-transparent text-meta hover:border-ink hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {healthStatus && healthStatus !== "ok" && (
          <EdTextarea
            value={healthNote}
            onChange={(e) => setHealthNote(e.target.value.slice(0, REVIEW_HEALTH_NOTE_MAX_LENGTH))}
            placeholder={
              healthStatus === "blessure"
                ? "Où es-tu blessé ? Depuis quand ?"
                : "Où as-tu une gêne ? Quand la ressens-tu ?"
            }
            className="mt-2 !min-h-16"
          />
        )}
      </div>

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
