"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { HygieneForm } from "@/components/hygiene/HygieneForm";
import { successFeedback } from "@/lib/feedback";
import { CheckIcon, HeartIcon } from "@/components/icons";
import { Overline } from "@/components/editorial/primitives";
import type { HygieneLog } from "@/lib/types";

/**
 * Heure à partir de laquelle la mission passe en rappel : c'est une mission du
 * SOIR (le joueur note sa journée écoulée, pas une journée qui commence).
 */
const EVENING_MINUTES = 18 * 60;

/**
 * Mission journalière de l'offre formation, posée en tête de la journée du
 * planning : noter son hygiène de vie (sommeil + 4 critères). Elle revient
 * chaque jour et compte comme une tâche du jour — le % de la journée ne peut
 * pas atteindre 100 % sans elle (calcul dans PlanningView, qui porte l'état).
 *
 * Le formulaire est le MÊME que celui de l'onglet Hygiène (une ligne par jour,
 * re-saisir corrige) : les deux entrées écrivent au même endroit.
 */
export function DailyMissionCard({
  date,
  dateLabel,
  log,
  done,
  nowMinutes,
  onDone,
}: {
  date: string;
  dateLabel: string;
  /** saisie du jour si elle existe déjà — le formulaire s'ouvre pré-rempli */
  log: HygieneLog | null;
  /** mission accomplie (état porté par le planning, qui la compte dans le %) */
  done: boolean;
  /** minutes écoulées depuis minuit (heure de Paris) */
  nowMinutes: number;
  /** remonte l'enregistrement : % du jour à jour + célébration éventuelle */
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);

  // rappel : le soir venu et rien de noté — la pastille pulse pour se signaler
  const remind = !done && nowMinutes >= EVENING_MINUTES;

  return (
    <div className="mb-5">
      <Overline className="mb-2">Ma mission du jour</Overline>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center gap-3 rounded-md border-2 px-3 py-3 text-left transition-colors ${
          done
            ? "border-ink/30 bg-transparent"
            : "border-ink bg-tan/50 hover:bg-tan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
        }`}
      >
        <span
          aria-hidden
          className={`shrink-0 ${done ? "text-meta" : "text-orange"} ${
            remind ? "animate-flame-pulse" : ""
          }`}
        >
          <HeartIcon size={20} />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`ed-value block truncate text-lg ${
              done ? "text-muted line-through" : "text-ink"
            }`}
          >
            Noter mon hygiène de vie
          </span>
          <span className="ed-meta block text-[9px] text-meta">
            {done
              ? "Journée notée — tu peux encore corriger"
              : "Sommeil, hydratation, nutrition · à remplir ce soir"}
          </span>
        </span>

        {/* Pastille d'état : coche une fois la journée notée, sinon compteur du
            soir qui rappelle qu'il reste une chose à faire avant de dormir. */}
        <span
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 ${
            done ? "border-ink/30 text-meta" : "border-ink bg-ink text-paper"
          }`}
        >
          {done ? <CheckIcon size={18} /> : <span className="ed-value text-sm">?</span>}
          {remind && (
            <span
              aria-hidden
              className="animate-pulse absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-ink bg-[#F5C518]"
            />
          )}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ma mission du jour"
        variant="retro"
      >
        <p className="ed-meta mb-3 text-[11px] leading-relaxed text-meta">
          Chaque soir, note ta journée : ton sommeil de la nuit dernière et tes quatre
          critères d&apos;alimentation. Une minute, tous les jours.
        </p>
        <HygieneForm
          date={date}
          dateLabel={dateLabel}
          initial={log}
          frameless
          onSaved={() => {
            // même enchaînement qu'un pointage de tâche : retour immédiat ici,
            // puis le planning décide s'il célèbre la journée bouclée
            successFeedback();
            onDone();
            setTimeout(() => setOpen(false), 900);
          }}
        />
      </Modal>
    </div>
  );
}
