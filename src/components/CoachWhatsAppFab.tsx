import { WhatsAppIcon } from "@/components/icons";
import { WHATSAPP_APP_URL } from "@/lib/whatsapp";

/**
 * Raccourci WhatsApp du joueur : bouton flottant en bas à droite, au-dessus de
 * la barre de navigation, présent sur tous les onglets joueur.
 *
 * Rendu depuis le layout joueur (et non par chaque page) pour qu'il suive
 * l'utilisateur d'un onglet à l'autre. Cadre rétro crème/navy comme le reste
 * du scope `.ed`, seule l'icône porte le vert de la marque.
 *
 * Le lien ouvre WhatsApp sans cibler de conversation : le joueur rouvre
 * lui-même le fil avec son coach. D'où l'absence de numéro — le bouton est
 * donc toujours affiché, même si la fiche du coach n'en porte pas.
 */
export function CoachWhatsAppFab() {
  const label = "Ouvrir WhatsApp pour écrire à ton coach";

  return (
    <a
      href={WHATSAPP_APP_URL}
      aria-label={label}
      title={label}
      className="bottom-above-nav fixed right-[22px] z-40 flex h-12 w-12 items-center justify-center rounded-md border-2 border-ink bg-paper text-[#25D366] shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8 lg:right-16"
    >
      <WhatsAppIcon size={24} />
    </a>
  );
}
