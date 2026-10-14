type Tone = "default" | "danger" | "warning";

const TONES: Record<Tone, string> = {
  default: "",
  // liseré gauche coloré : la boîte qui demande une action se repère de loin
  danger: "border-l-4 border-l-danger",
  warning: "border-l-4 border-l-warning",
};

/**
 * Carte blanche aux ombres douces (direction « Parquet ») — réservée à ce qui
 * demande une action (répondre, valider, saisir). Ce qui se consulte va dans
 * une `Section` plate : c'est la différence entre les deux qui donne sa
 * hiérarchie à une page.
 */
export function Card({
  children,
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`shadow-soft rounded-[20px] bg-white p-5 ${TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`font-display mb-3 text-[18px] font-bold uppercase tracking-wide text-navy-800 ${className}`}
    >
      {children}
    </h2>
  );
}
