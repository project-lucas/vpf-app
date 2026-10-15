"use client";

import { useState } from "react";
import { CircleDashed } from "lucide-react";
import type { PlayerOffer } from "@/lib/types";

/**
 * « Parcours » (Admin) : le chemin d'un joueur Perf et d'un joueur Formation,
 * de son arrivée à la fin de saison. Même rendu que « À savoir sur Jarvis »
 * (fond blanc, phrases courtes). Le contenu est À DÉFINIR avec Lucas et
 * Maxime : il suffira de remplir `JOURNEYS` — une étape = un titre, quand,
 * et ce qui s'y passe.
 */
interface JourneyStep {
  title: string;
  /** « Semaine 1 », « Chaque dimanche »… */
  when?: string;
  lines: string[];
}

const JOURNEYS: Record<PlayerOffer, { tagline: string; steps: JourneyStep[] }> = {
  perf: {
    tagline: "Suivi à distance : directives semaine après semaine.",
    steps: [],
  },
  formation: {
    tagline: "Perf + hygiène de vie et fils privés avec le staff.",
    steps: [],
  },
};

const LABELS: Record<PlayerOffer, string> = { perf: "Perf", formation: "Formation" };

export function PlayerJourneyPanel() {
  const [offer, setOffer] = useState<PlayerOffer>("perf");
  const journey = JOURNEYS[offer];

  return (
    // le volet est crème : ce panneau pose son propre fond blanc, bord à bord
    <div className="-mx-5 -my-4 min-h-full bg-white px-6 py-6">
      <div role="tablist" aria-label="Offre" className="grid grid-cols-2 gap-1 rounded-2xl bg-navy-50 p-1">
        {(["perf", "formation"] as const).map((o) => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={offer === o}
            onClick={() => setOffer(o)}
            className={`rounded-xl py-2 text-[14px] font-extrabold transition-colors ${
              offer === o ? "bg-navy-800 text-white" : "text-navy-600 hover:text-navy-900"
            }`}
          >
            Joueur {LABELS[o]}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-navy-800">{journey.tagline}</p>

      {journey.steps.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-navy-100 px-6 py-10 text-center">
          <CircleDashed size={26} className="text-accent" />
          <p className="text-[15px] font-extrabold text-navy-900">Parcours {LABELS[offer]} à définir</p>
          <p className="max-w-[320px] text-[13.5px] leading-snug text-navy-500">
            Les étapes, de l&apos;arrivée du joueur à la fin de saison, seront décrites ici une fois
            arrêtées ensemble.
          </p>
        </div>
      ) : (
        <ol className="mt-6 space-y-5">
          {journey.steps.map((step, i) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[13px] font-extrabold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="flex flex-wrap items-baseline gap-2 text-[15px] font-extrabold text-navy-900">
                  {step.title}
                  {step.when && (
                    <span className="rounded-md bg-navy-800 px-1.5 py-0.5 text-[11px] font-extrabold text-white">
                      {step.when}
                    </span>
                  )}
                </h3>
                <ul className="mt-1 space-y-1">
                  {step.lines.map((line) => (
                    <li key={line} className="text-[14px] leading-snug text-navy-700">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
