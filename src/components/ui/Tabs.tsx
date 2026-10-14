"use client";

import { useState } from "react";

export interface TabItem {
  /** clé stable — sert au ciblage par URL (`?onglet=`) */
  key?: string;
  label: React.ReactNode;
  content: React.ReactNode;
  /** pastille rouge sur l'onglet : quelque chose y attend */
  dot?: boolean;
}

/**
 * Nombre d'onglets jusqu'auquel la barre tient sur une ligne, à largeur égale.
 * Au-delà, elle redevient une bande qui défile — mais un onglet caché est un
 * onglet qu'on ne trouve pas : les écrans du staff restent sous cette borne.
 */
const SEGMENTED_MAX = 5;

/**
 * Onglets à contenus montés d'entrée (les inactifs sont masqués, pas
 * démontés : un formulaire garde son état, un fil de messages son défilement).
 *
 * Jusqu'à cinq onglets, la barre est un bloc segmenté pleine largeur : tous
 * visibles d'un coup, aucun à aller chercher en faisant défiler. Au-delà, ou
 * en `variant="sub"` (second niveau, plus discret — les pôles du Programme
 * dans la fiche joueur), c'est une rangée de pilules.
 */
export function Tabs({
  items,
  initialKey,
  variant = "default",
}: {
  items: TabItem[];
  /** onglet ouvert au chargement (par clé) — le premier sinon */
  initialKey?: string;
  variant?: "default" | "sub";
}) {
  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.key !== undefined && item.key === initialKey)
  );
  const [active, setActive] = useState(initialIndex);
  const sub = variant === "sub";
  const segmented = !sub && items.length <= SEGMENTED_MAX;

  const dot = (item: TabItem) =>
    item.dot && (
      <span
        aria-hidden
        className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-danger ${
          "border-white"
        }`}
      />
    );

  return (
    <div>
      {segmented ? (
        // onglets soulignés (direction « Parquet ») : le trait orange dit où l'on est
        <div role="tablist" className="mb-5 flex gap-1 border-b border-sand sm:gap-6">
          {items.map((item, i) => {
            const isActive = i === active;
            return (
              <button
                key={item.key ?? i}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className={`relative -mb-px min-w-0 flex-1 truncate border-b-[3px] px-1 py-2.5 text-[13px] font-bold transition-colors sm:flex-none sm:px-0.5 sm:text-sm ${
                  isActive
                    ? "border-accent text-navy-900"
                    : "border-transparent text-navy-400 hover:text-navy-800"
                }`}
              >
                {item.label}
                {dot(item)}
              </button>
            );
          })}
        </div>
      ) : (
        // Au doigt : bande qui défile bord à bord. À la souris : retour à la
        // ligne — sans barre de défilement visible, les derniers onglets
        // étaient inatteignables sur ordinateur.
        <div
          role="tablist"
          className={`scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pointer-fine:mx-0 pointer-fine:flex-wrap pointer-fine:overflow-x-visible pointer-fine:px-0 ${
            sub ? "mb-3" : "mb-4"
          }`}
        >
          {items.map((item, i) => {
            const isActive = i === active;
            return (
              <button
                key={item.key ?? i}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className={
                  sub
                    ? `relative shrink-0 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                        isActive ? "bg-navy-100 text-navy-900" : "text-navy-400 hover:text-navy-800"
                      }`
                    : `relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? "bg-navy-800 text-white"
                          : "border border-navy-200 bg-white text-navy-500"
                      }`
                }
              >
                {item.label}
                {dot(item)}
              </button>
            );
          })}
        </div>
      )}
      {items.map((item, i) => (
        <div key={item.key ?? i} role="tabpanel" hidden={i !== active}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
