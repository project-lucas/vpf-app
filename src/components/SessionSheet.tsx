"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Fiche de training d'une séance : toujours visible (pas derrière un bouton),
 * cliquable pour l'ouvrir en plein écran et pouvoir zoomer/faire défiler.
 *
 * L'ordre fiche/vidéo dépend du pôle et est décidé par l'appelant
 * (SessionCard) : physique = fiche au-dessus, technique = fiche en dessous.
 */
export function SessionSheet({ url, sessionName }: { url: string; sessionName: string }) {
  const [zoomed, setZoomed] = useState(false);
  // le pinch-to-zoom natif est désactivé (viewport maximumScale: 1) : le zoom
  // est donc explicite — plein écran ajusté, puis taille réelle défilable
  const [full, setFull] = useState(false);
  // le portal n'existe qu'après montage client (pas de document côté serveur)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!zoomed) return;
    setFull(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomed(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoomed]);

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={`Agrandir la fiche : ${sessionName}`}
        className="group block w-full cursor-zoom-in rounded-lg border-2 border-ink bg-card p-1.5 text-left"
      >
        <span className="relative block overflow-hidden rounded-md bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL Supabase externe */}
          <img
            src={url}
            alt={`Fiche de training — ${sessionName}`}
            loading="lazy"
            decoding="async"
            className="block w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
          />
          <span className="ed-meta absolute bottom-2 right-2 rounded border border-ink/20 bg-card/90 px-1.5 py-0.5 text-[9px] text-ink">
            Fiche · toucher pour agrandir
          </span>
        </span>
      </button>

      {zoomed &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-[#1c3a4b]/95">
            {/* ajusté par défaut ; au clic l'image passe en taille réelle et
                l'overlay défile (le vrai « zoom », pinch-to-zoom étant bloqué) */}
            <div className={`h-full w-full p-3 ${full ? "overflow-auto" : "overflow-hidden"}`}>
              <button
                type="button"
                onClick={() => setFull((v) => !v)}
                aria-label={full ? "Réduire la fiche" : "Zoomer dans la fiche"}
                className={`flex ${full ? "" : "h-full w-full items-center justify-center"} ${
                  full ? "cursor-zoom-out" : "cursor-zoom-in"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- URL Supabase externe */}
                <img
                  src={url}
                  alt={`Fiche de training — ${sessionName}`}
                  className={full ? "max-w-none" : "max-h-full max-w-full object-contain"}
                />
              </button>
            </div>
            <p className="ed-meta pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded border border-paper/30 px-2 py-1 text-[9px] text-paper/80">
              {full ? "Toucher l'image pour réduire" : "Toucher l'image pour zoomer"}
            </p>
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label="Fermer la fiche"
              autoFocus
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-paper bg-ink text-paper"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
