/**
 * Offres VPF — source unique de ce que chaque offre débloque.
 *
 *  * « perf » (offre 1) : toute l'application, sauf l'hygiène de vie.
 *  * « formation » (offre 2) : tout, hygiène de vie comprise.
 *
 * À ce jour, l'hygiène de vie est la SEULE différence entre les deux offres.
 * Tout est écrit en mode formation ; c'est l'offre perf qui RETIRE un écran.
 * Ajouter une restriction = ajouter un helper ici, jamais un test `=== "perf"`
 * disséminé dans les pages.
 *
 * L'offre est choisie par le coach (invitation puis fiche joueur) et stockée
 * sur la fiche joueur (migration 0026). Elle ne conditionne aucune donnée :
 * changer d'offre n'efface rien, l'historique du joueur lui reste acquis.
 */

import type { PlayerOffer } from "@/lib/types";

export const PLAYER_OFFERS: readonly PlayerOffer[] = ["perf", "formation"] as const;

export const OFFER_LABELS: Record<PlayerOffer, string> = {
  perf: "Perf",
  formation: "Formation",
};

/** Ce que le coach lit sous le sélecteur d'offre, pour choisir sans hésiter. */
export const OFFER_HINTS: Record<PlayerOffer, string> = {
  perf: "Toute l'application, sans l'onglet Hygiène de vie.",
  formation: "Tout Perf, plus l'onglet Hygiène de vie.",
};

/** Offre par défaut : une fiche sans offre explicite est une fiche formation. */
export const DEFAULT_OFFER: PlayerOffer = "formation";

/** Normalise une valeur venant de la base ou d'un formulaire. */
export function toOffer(value: unknown): PlayerOffer {
  return value === "perf" ? "perf" : DEFAULT_OFFER;
}

/**
 * Hygiène de vie (onglet joueur + saisie quotidienne) : offre formation.
 * Seule différence entre les deux offres — tout le reste (planning, dashboard,
 * séances, bilans, objectifs mesurables) est identique en perf et en formation.
 */
export function canUseHygiene(offer: PlayerOffer): boolean {
  return offer === "formation";
}
