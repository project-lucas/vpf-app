"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "@/components/Confetti";
import { TrophyIcon } from "@/components/icons";
import { BasketballIcon } from "@/components/planning/EventIcon";
import { EdButton } from "@/components/editorial/forms";
import { recordBeatenFeedback } from "@/lib/feedback";
import { RECORD_LABELS, type MatchRecords, type RecordKey } from "@/lib/gamification";
import { MatchStatForm } from "@/app/(player)/dashboard/MatchStatForm";
import { ReminderMark } from "./WeeklyReviewLauncher";

/**
 * Pastille « Ma feuille de match » (bas de la page planning), même mise en forme
 * que le bilan. Point d'interrogation jaune le week-end tant que rien n'est
 * rempli (`remind`). Célèbre les records battus à la saisie.
 */
export function MatchSheetLauncher({
  records,
  hasMatch,
  remind,
}: {
  records?: MatchRecords;
  /** au moins une feuille saisie cette semaine (coche verte) */
  hasMatch: boolean;
  remind: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [beaten, setBeaten] = useState<RecordKey[]>([]);

  function handleSuccess(beatenRecords: RecordKey[]) {
    setOpen(false);
    if (beatenRecords.length > 0) {
      recordBeatenFeedback();
      setBeaten(beatenRecords);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ma feuille de match"
        className={`relative inline-flex items-center gap-1.5 rounded-md border-2 px-3 py-2 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
          hasMatch ? "border-ink/30 bg-transparent text-meta" : "border-ink bg-tan text-ink"
        }`}
      >
        {hasMatch ? <Check size={15} /> : <BasketballIcon size={15} />}
        Ma feuille de match
        {remind && <ReminderMark />}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Ma feuille de match" variant="retro">
        <MatchStatForm records={records} onSuccess={handleSuccess} />
      </Modal>

      {/* Célébration record(s) battu(s) */}
      {beaten.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c3a4b]/80 px-8"
          onClick={() => setBeaten([])}
        >
          <Confetti count={70} />
          <div className="animate-pop w-full max-w-sm rounded-lg border-2 border-ink bg-card p-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-orange bg-ink text-warm">
              <TrophyIcon size={34} />
            </span>
            <p className="ed-display mt-4 text-[26px] text-ink">Record battu</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {beaten.map((key) => (
                <span
                  key={key}
                  className="ed-meta rounded border border-ink px-2.5 py-1 text-[10px] text-orange"
                >
                  {RECORD_LABELS[key]}
                </span>
              ))}
            </div>
            <p className="ed-meta mt-3 text-[10px] leading-relaxed text-meta">
              Le tableau d&apos;honneur est mis à jour. Prochain objectif : le battre encore.
            </p>
            <EdButton onClick={() => setBeaten([])} full className="mt-6">
              Continuer
            </EdButton>
          </div>
        </div>
      )}
    </>
  );
}
