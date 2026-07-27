"use client";

import dynamic from "next/dynamic";

export type { ProgressPoint } from "./ProgressAreaChart";

/**
 * Courbe de croissance, chargée à la demande (voir PlayerRadar : recharts sort
 * du paquet initial et n'est téléchargé qu'à l'ouverture de la section Stats).
 */
export const ProgressChart = dynamic(
  () => import("./ProgressAreaChart").then((m) => m.ProgressChart),
  {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-2xl bg-navy-100" aria-hidden />,
  }
);
