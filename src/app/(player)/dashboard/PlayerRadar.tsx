"use client";

import dynamic from "next/dynamic";

export type { RadarMatch } from "./PlayerRadarChart";

/**
 * Radar du joueur, chargé à la demande.
 *
 * recharts pèse à lui seul plus que tout le reste du JS de l'application : le
 * charger avec la page rallongeait l'affichage du dashboard sur mobile alors
 * que le radar vit dans un onglet fermé par défaut. Il est donc téléchargé au
 * moment où il devient visible, derrière un bloc de chargement de même hauteur
 * (pas de saut de mise en page).
 */
export const PlayerRadar = dynamic(
  () => import("./PlayerRadarChart").then((m) => m.PlayerRadar),
  {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-2xl bg-navy-100" aria-hidden />,
  }
);
