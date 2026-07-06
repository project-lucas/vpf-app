"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "@/components/Confetti";
import { PlusIcon, TrophyIcon } from "@/components/icons";
import { BasketballIcon } from "@/components/planning/EventIcon";
import { EdButton } from "@/components/editorial/forms";
import { recordBeatenFeedback } from "@/lib/feedback";
import { RECORD_LABELS, type MatchRecords, type RecordKey } from "@/lib/gamification";
import { MatchStatForm } from "./MatchStatForm";

export function AddMatchButton({
  records,
  variant = "icon",
}: {
  records?: MatchRecords;
  /** "icon" : petit + rond · "cta" : bouton pleine largeur (header du dashboard) */
  variant?: "icon" | "cta";
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
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ajouter un match"
          title="Ajouter un match"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-card text-ink transition-colors hover:bg-ink/5"
        >
          <PlusIcon size={20} />
        </button>
      ) : (
        <EdButton variant="navy" full onClick={() => setOpen(true)}>
          <BasketballIcon size={18} /> Remplir ma feuille de match
        </EdButton>
      )}

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
