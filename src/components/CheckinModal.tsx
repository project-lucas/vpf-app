"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { submitCheckin } from "@/app/actions/player";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { CheckinQuestion } from "@/lib/types";

const QUESTIONS: Record<CheckinQuestion, string> = {
  energy: "Quel est ton niveau d'énergie en ce moment ?",
  pain: "Ressens-tu des douleurs en ce moment ?",
};

const HINTS: Record<CheckinQuestion, [string, string]> = {
  energy: ["0 = épuisé", "10 = plein d'énergie"],
  pain: ["0 = aucune douleur", "10 = douleur forte"],
};

export function CheckinModal({ question }: { question: CheckinQuestion }) {
  const [open, setOpen] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (score === null) return;
    setLoading(true);
    const result = await submitCheckin(question, score);
    if (result.ok) {
      setOpen(false);
    } else {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={
        <span className="inline-flex items-center gap-2">
          Petit check rapide <Hand size={18} className="text-warning" />
        </span>
      }
    >
      <p className="font-semibold text-navy-800">{QUESTIONS[question]}</p>
      <div className="mt-4 grid grid-cols-6 gap-2">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setScore(i)}
            className={`rounded-xl py-2.5 text-sm font-bold transition-colors ${
              score === i
                ? "bg-navy-800 text-white"
                : "bg-navy-50 text-navy-600 hover:bg-navy-100"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-navy-400">
        <span>{HINTS[question][0]}</span>
        <span>{HINTS[question][1]}</span>
      </div>
      <Button full size="lg" className="mt-5" disabled={score === null || loading} onClick={handleSubmit}>
        {loading ? "Envoi…" : "Valider"}
      </Button>
    </Modal>
  );
}
