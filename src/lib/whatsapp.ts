// Liens WhatsApp — bouton flottant du joueur (ouverture simple de WhatsApp) et
// boutons de la liste des joueurs côté coach (conversation ciblée).

/**
 * Ouvre simplement l'application WhatsApp, sans cibler de conversation : le
 * joueur retrouve lui-même le fil avec son coach. Le schéma `whatsapp://` est
 * pris en charge par l'app mobile (et par WhatsApp Desktop s'il est installé) —
 * l'app étant une PWA mobile, c'est le cas courant.
 */
export const WHATSAPP_APP_URL = "whatsapp://";

/** En dessous, ce n'est pas un numéro exploitable : mieux vaut ne rien afficher. */
const MIN_DIGITS = 8;

/**
 * Met un numéro au format attendu par wa.me : chiffres seuls, indicatif pays
 * compris, sans « + » ni « 00 ».
 *
 * Les champs WhatsApp de l'app sont libres et se remplissent en pratique au
 * format national (« 0667009331 ») alors que wa.me exige l'international :
 * sans cette normalisation le lien ouvre WhatsApp sur un numéro introuvable.
 * On suppose la France pour les numéros à 10 chiffres commençant par 0 — le
 * club est français — et tout numéro déjà international est laissé intact.
 */
export function toWaMeNumber(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) return digits; // déjà international
  if (digits.startsWith("00")) return digits.slice(2); // ancien préfixe international
  if (digits.length === 10 && digits.startsWith("0")) return `33${digits.slice(1)}`;
  return digits;
}

/**
 * URL d'ouverture de la conversation WhatsApp, ou `null` si le numéro est
 * absent ou inexploitable — l'appelant n'affiche alors pas de bouton.
 */
export function waMeUrl(raw: string | null | undefined): string | null {
  const digits = toWaMeNumber(raw);
  return digits.length >= MIN_DIGITS ? `https://wa.me/${digits}` : null;
}
