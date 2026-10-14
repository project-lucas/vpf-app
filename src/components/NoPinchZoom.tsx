"use client";

import { useEffect } from "react";

/**
 * Garde iOS contre le pinch-to-zoom : Safari ignore `user-scalable=no` mais
 * annule le geste quand `gesturestart` est empêché. Complète `touch-action:
 * pan-x pan-y` (globals.css) pour les versions d'iOS qui ne l'honorent pas.
 *
 * Le zoom natif faisait blanchir la page (rendu WebKit) : tant qu'il est
 * coupé, le bug ne peut plus se déclencher.
 */
export function NoPinchZoom() {
  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", block, { passive: false });
    document.addEventListener("gesturechange", block, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
    };
  }, []);
  return null;
}
