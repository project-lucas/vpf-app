"use client";

import type { ReactNode } from "react";

export interface EdTab {
  key: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/**
 * Onglets soulignés « Éditorial Sport ».
 * Actif = libellé encre + trait orange 3px dessous ; inactif = gris méta.
 * Le compteur est un petit chiffre en exposant (orange si actif).
 */
export function EditorialTabs({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: EdTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex items-stretch gap-5 border-b-2 border-ink ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`ed-meta relative -mb-0.5 flex items-center gap-1.5 pb-2.5 pt-1 text-[12px] transition-colors ${
              isActive ? "text-ink" : "text-muted hover:text-meta"
            }`}
          >
            {tab.icon && <span aria-hidden>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count != null && (
              <sup className={`text-[10px] ${isActive ? "text-orange" : "text-muted"}`}>
                {tab.count}
              </sup>
            )}
            {isActive && (
              <span aria-hidden className="absolute inset-x-0 -bottom-[3px] h-[3px] bg-orange" />
            )}
          </button>
        );
      })}
    </div>
  );
}
