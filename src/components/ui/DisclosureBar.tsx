"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DisclosureItem {
  key: string;
  icon: ReactNode;
  label: string;
  /** compteur posé sur l'icône (alertes, non-lus) — 0 = rien */
  count?: number;
  /** contenu déplié — rendu côté serveur et passé tel quel */
  content: ReactNode;
}

/**
 * Barre d'icônes dépliantes — le geste unique de l'interface staff pour tout
 * ce qui se consulte moins d'une fois par jour.
 *
 * Une rangée de boutons (icône + mot), un seul déplié à la fois, le panneau
 * juste dessous. Ce qui était une pile de cartes devient une ligne d'icônes :
 * l'information est à un tap, mais elle ne pousse plus le reste hors de
 * l'écran. Même mécanique que l'engrenage du profil joueur, appliquée au staff.
 *
 * Les contenus sont montés d'entrée et masqués (`hidden`) : pas de requête au
 * clic, et un panneau qui contient un formulaire garde son état.
 */
export function DisclosureBar({
  items,
  initialKey = null,
  className = "",
}: {
  items: DisclosureItem[];
  /** panneau ouvert au chargement (aucun par défaut) */
  initialKey?: string | null;
  className?: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(initialKey);

  return (
    <div className={className}>
      <div
        role="tablist"
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const isOpen = item.key === openKey;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isOpen}
              aria-controls={`disclosure-${item.key}`}
              onClick={() => setOpenKey(isOpen ? null : item.key)}
              className={`relative flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                isOpen
                  ? "border-navy-800 bg-navy-800 text-white"
                  : "border-navy-100 bg-white text-navy-500 hover:border-navy-300 hover:text-navy-800"
              }`}
            >
              <span className="relative">
                {item.icon}
                {item.count ? (
                  <span
                    className={`absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold ${
                      isOpen ? "bg-white text-navy-800" : "bg-danger text-white"
                    }`}
                  >
                    {item.count}
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate">{item.label}</span>
              <ChevronDown
                size={11}
                className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.key}
          id={`disclosure-${item.key}`}
          role="tabpanel"
          hidden={item.key !== openKey}
          className="mt-3"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
