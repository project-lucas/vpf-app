type Tone = "neutral" | "success" | "danger" | "warning" | "navy";

/**
 * La couleur est un sens, jamais une décoration :
 *
 *  * `danger`  — à traiter maintenant ;
 *  * `warning` — à surveiller ;
 *  * `success` — une confirmation ponctuelle (fait, reçu), jamais un état
 *    permanent (« aucune alerte » ne se dit pas en vert, il ne se dit pas) ;
 *  * `navy`    — une étiquette forte (offre, rôle) ;
 *  * `neutral` — une information sans urgence, en creux : pas de fond, un
 *    simple liseré. C'est la pilule qu'on doit pouvoir mettre partout sans
 *    charger la ligne.
 */
const tones: Record<Tone, string> = {
  neutral: "ring-1 ring-inset ring-navy-200 text-navy-500",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  navy: "bg-navy-800 text-white",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
