"use client";

import { useState, useTransition } from "react";
import { Trophy } from "lucide-react";
import { skipMatch } from "@/app/actions/player";
import { Modal } from "@/components/ui/Modal";
import { MatchStatForm } from "@/app/(player)/dashboard/MatchStatForm";

/**
 * La feuille de match en pop-up bloquant (0043) : après un match du planning,
 * l'écran joueur s'ouvre sur ses stats à saisir et ne se ferme pas sans elles.
 * Une seule sortie sans saisie : « Je n'ai pas joué ce match », qui pointe le
 * match comme non joué (le coach le voit dans le planning).
 */
export function MatchGate({
  eventId,
  weekStart,
  date,
  dateLabel,
}: {
  eventId: string;
  weekStart: string;
  date: string;
  dateLabel: string;
}) {
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function didNotPlay() {
    setError(null);
    startTransition(async () => {
      const result = await skipMatch(eventId, weekStart);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Modal
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          <Trophy size={22} className="text-orange" />
          Ta feuille de match
        </span>
      }
      variant="retro"
    >
      <p className="ed-meta mb-3 text-[11px] leading-relaxed text-meta">
        Ton match de {dateLabel} est passé. Remplis tes stats maintenant : une minute, et tes records
        et ton suivi sont à jour.
      </p>
      <MatchStatForm initialDate={date} onSuccess={() => setOpen(false)} />
      {error && (
        <p className="ed-meta mt-3 rounded-md border-2 border-orange px-3 py-2 text-[11px] text-orange">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={didNotPlay}
        disabled={isPending}
        className="ed-meta mt-4 w-full rounded-md border-2 border-ink/30 px-3 py-2.5 text-[11px] text-meta transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
      >
        {isPending ? "Un instant…" : "Je n'ai pas joué ce match"}
      </button>
    </Modal>
  );
}
