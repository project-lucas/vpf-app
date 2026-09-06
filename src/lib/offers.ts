/**
 * Offres VPF — source unique de ce que chaque offre débloque.
 *
 *  * « perf » (offre 1) : toute l'application, sauf l'hygiène de vie et les
 *    fils privés avec les admins.
 *  * « formation » (offre 2) : tout.
 *
 * Deux différences à ce jour : l'hygiène de vie et les fils privés (le joueur
 * formation écrit à chaque admin en plus du fil coach & parents).
 * Tout est écrit en mode formation ; c'est l'offre perf qui RETIRE.
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
 */
export function canUseHygiene(offer: PlayerOffer): boolean {
  return offer === "formation";
}

/**
 * Fils privés avec les admins (0034) : offre formation. Un joueur perf n'a
 * qu'un seul fil, celui de son coach (et de ses parents).
 *
 * L'historique n'est jamais perdu : repasser en perf masque les fils privés,
 * repasser en formation les retrouve intacts.
 */
export function canUsePrivateChannels(offer: PlayerOffer): boolean {
  return offer === "formation";
}
