import { WhatsAppIcon } from "@/components/icons";
import { waMeUrl } from "@/lib/whatsapp";

/**
 * Raccourci « écrire à ce joueur sur WhatsApp », collé à la ligne du joueur
 * côté coach. Un clic ouvre directement la conversation avec lui.
 *
 * Rien n'est rendu tant que le coach n'a pas saisi le numéro dans la fiche du
 * joueur (onglet Profil) : mieux vaut pas de bouton qu'un lien mort.
 *
 * À placer en FRÈRE de la carte cliquable, jamais à l'intérieur : un <a> dans
 * un <a> est du HTML invalide et le navigateur défait l'imbrication. D'où le
 * `className` de positionnement laissé à l'appelant.
 */
export function PlayerWhatsAppLink({
  whatsappNumber,
  playerName,
  size = "sm",
  className = "",
}: {
  whatsappNumber: string | null | undefined;
  playerName: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const href = waMeUrl(whatsappNumber);
  if (!href) return null;

  const label = `Écrire à ${playerName} sur WhatsApp`;
  const box = size === "md" ? "h-10 w-10" : "h-8 w-8";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`flex ${box} shrink-0 items-center justify-center rounded-full border border-navy-200 bg-white text-[#25D366] transition-colors hover:border-[#25D366] hover:bg-[#25D366]/10 ${className}`}
    >
      <WhatsAppIcon size={size === "md" ? 20 : 16} />
    </a>
  );
}
