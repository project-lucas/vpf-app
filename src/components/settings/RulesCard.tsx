"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";

/** Règles du service, repliées par défaut : le titre déplie la liste. */
export function RulesCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="ed-overline">Règles du service</span>
        <span className="text-meta">
          {open ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        </span>
      </button>
      {open && (
        <ul className="mt-3 list-inside list-disc space-y-1.5 font-body text-sm text-meta">
          <li>1 visio par mois maximum avec ton coach référent.</li>
          <li>Les demandes de visio se font directement auprès de ton coach.</li>
          <li>Ton coach peut aussi ajuster ta fiche et ton objectif de saison.</li>
        </ul>
      )}
    </div>
  );
}
