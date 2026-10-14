import type { PlayerAlert } from "./alerts";
import { formatPercent } from "./discipline";
import type { PlayerDiscipline } from "./coach-data";

/**
 * Le brief du jour (couche 1) : des règles fixes qui transforment les alertes
 * d'un joueur en une action à faire et, quand ça s'y prête, en un message
 * prêt à envoyer. Rien d'intelligent ici — des modèles à trous, le prénom et
 * la situation. Le passage automatique du matin (couche 2) viendra affiner,
 * pas remplacer : si lui ne tourne pas, ceci tourne.
 *
 * Un message n'est proposé que pour ce qui se règle en écrivant AU JOUEUR.
 * Une séance à replacer, un programme vide, un bilan à répondre : ce sont des
 * gestes du coach dans la fiche, pas un message.
 */
export function suggestMessage(alert: PlayerAlert, player: PlayerDiscipline): string | null {
  const prenom = player.first_name.trim() || "toi";
  switch (alert.key) {
    case "review-missing":
      return `Salut ${prenom} ! Ton bilan de la semaine dernière n'est pas rempli. Deux minutes dans l'app ce soir et c'est bouclé 📝`;
    case "discipline":
      return `${prenom}, semaine compliquée côté planning (${formatPercent(player.discipline)}). Qu'est-ce qui a coincé ? On ajuste ensemble si besoin 💪`;
    case "silence":
      return `Salut ${prenom}, ça fait un moment qu'on n'a pas échangé ici. Comment tu te sens à l'entraînement en ce moment ?`;
    case "pain":
      return `${prenom}, j'ai vu ta douleur dans ton dernier check-in. C'est où exactement, et depuis quand ? On adapte la semaine si besoin.`;
    case "planning-empty":
      return `${prenom}, ton planning de la semaine est vide. Ajoute tes entraînements club et tes créneaux perso : c'est la base du suivi 🗓️`;
    default:
      return null;
  }
}

/**
 * Le message à proposer sur une ligne du brief : celui de l'alerte la plus
 * urgente qui en a un (les alertes arrivent déjà triées, rouges d'abord).
 */
export function suggestForRow(
  alerts: PlayerAlert[],
  player: PlayerDiscipline
): { alert: PlayerAlert; text: string } | null {
  for (const alert of alerts) {
    const text = suggestMessage(alert, player);
    if (text) return { alert, text };
  }
  return null;
}
