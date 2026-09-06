export interface StatStripItem {
  label: string;
  value: string;
  hint?: string;
  /** met la valeur en couleur : un chiffre qui demande l'attention */
  tone?: "default" | "danger" | "warning";
}

// sur fond navy, l'attention se dit en or — le rouge y devient illisible
const VALUE_TONES: Record<NonNullable<StatStripItem["tone"]>, string> = {
  default: "text-white",
  danger: "text-gold",
  warning: "text-gold",
};

/**
 * Tableau d'affichage : les indicateurs d'une page sur une seule ligne, en
 * chiffres de scoreboard — fond navy, capitales espacées, digits Barlow.
 *
 * C'est la signature basket de l'interface staff, et le seul élément sombre
 * d'une page : il donne le ton en haut, et tout ce qui suit se lit en clair.
 * Quatre cartes blanches pesaient autant que le contenu qu'elles introduisaient ;
 * un tableau d'affichage se lit comme un en-tête.
 */
export function StatStrip({ items, className = "" }: { items: StatStripItem[]; className?: string }) {
  return (
    <dl
      className={`relative grid divide-x divide-navy-700 overflow-hidden rounded-2xl bg-navy-900 shadow-md ${className}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {/* liseré or en haut : la ligne du parquet, comme sous les titres */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gold" />
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-3 pb-2.5 pt-3.5 first:pl-4 last:pr-4">
          <dt className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-navy-300">
            {item.label}
          </dt>
          <dd
            className={`font-display mt-1 text-[26px] font-bold leading-none tabular-nums ${VALUE_TONES[item.tone ?? "default"]}`}
          >
            {item.value}
          </dd>
          {item.hint && <dd className="mt-1 truncate text-[10px] text-navy-400">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
