/**
 * Accès anticipé : les écrans en cours de construction ne sont visibles que
 * par les joueurs listés ici. Les autres gardent l'application telle qu'elle
 * est en production — l'onglet n'apparaît pas et l'URL renvoie un 404.
 *
 * Pour ouvrir à tout le monde une fois l'écran prêt : supprimer les appels à
 * isBetaPlayer() (layout joueur + page /seances) plutôt que d'ajouter tous
 * les ids ici.
 */
const BETA_PLAYER_IDS: string[] = [
  "df7658d7-02ff-4625-a14e-54d6fe5781c7", // Yanis Traoré
];

/** true si ce joueur voit l'onglet Programme (et les écrans en chantier). */
export function isBetaPlayer(userId: string | null | undefined): boolean {
  return Boolean(userId && BETA_PLAYER_IDS.includes(userId));
}
