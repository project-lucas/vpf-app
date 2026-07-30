"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Settings, X } from "lucide-react";

/**
 * Bouton flottant « paramètres » (à gauche de la cloche des annonces) et
 * panneau qui porte tout le réglage du compte : fiche basket, notifications,
 * mot de passe, règles, déconnexion.
 *
 * L'onglet Profil est d'abord une messagerie — ces réglages, consultés une fois
 * par saison, encombraient la page sous la conversation. Ils sont rendus côté
 * serveur et passés en `children` : ce composant ne fait qu'ouvrir et fermer.
 */
export function SettingsSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {/* aligné sur la cloche des annonces (même top-[120px], sous l'emblème)
          et décalé de sa largeur (44px) + une gouttière, à chaque palier de
          padding de la page joueur */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Paramètres du compte"
        className="fixed right-[74px] top-[120px] z-40 flex h-11 w-11 items-center justify-center rounded-md border-2 border-ink bg-paper text-ink shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-[84px] lg:right-[116px]"
      >
        <Settings size={20} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-[22px] pb-8 pt-16 sm:px-8"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Paramètres du compte"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border-2 border-ink bg-paper shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-ink px-4 py-3">
              <p className="ed-overline flex items-center gap-1.5">
                <Settings size={13} />
                Paramètres
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer les paramètres"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-ink/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-1">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
