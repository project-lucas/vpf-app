"use client";

import dynamic from "next/dynamic";

/**
 * Radar d'hygiène de vie, chargé à la demande : la saisie du jour (le geste
 * quotidien du joueur) s'affiche sans attendre recharts, qui n'arrive que pour
 * dessiner les moyennes plus bas dans la page.
 */
export const HygieneRadar = dynamic(
  () => import("./HygieneRadarChart").then((m) => m.HygieneRadar),
  {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-2xl bg-navy-100" aria-hidden />,
  }
);
