export interface StatStripItem {
  label: string;
  value: string;
  hint?: string;
  /** met la valeur en couleur : un chiffre qui demande l'attention */
  tone?: "default" | "danger" | "warning";
}

const VALUE_TONES: Record<NonNullable<StatStripItem["tone"]>, string> = {
  default: "text-navy-900",
  danger: "text-accent",
  warning: "text-warning",
};

/**
 * Les indicateurs d'une page (direction « Parquet ») : une rangée de cartes
 * blanches, le libellé au-dessus, le chiffre en Barlow, un indice dessous.
 */
export function StatStrip({ items, className = "" }: { items: StatStripItem[]; className?: string }) {
  return (
    <dl
      className={`grid grid-cols-3 gap-2 sm:gap-3 lg:[grid-template-columns:var(--cols)] ${className}`}
      style={{ ["--cols" as string]: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div key={item.label} className="shadow-soft min-w-0 rounded-[14px] bg-white px-2.5 py-2.5 sm:rounded-[18px] sm:px-4 sm:py-3.5">
          {/* téléphone : grille de 3, libellé sur deux lignes, chiffre plus petit */}
          <dt className="line-clamp-2 min-h-[2.4em] text-[10.5px] font-semibold leading-tight text-navy-400 sm:line-clamp-none sm:min-h-0 sm:truncate sm:text-[12px]">
            {item.label}
          </dt>
          <dd
            className={`font-display mt-1 text-[22px] font-extrabold leading-none tabular-nums sm:text-[32px] ${VALUE_TONES[item.tone ?? "default"]}`}
          >
            {item.value}
          </dd>
          {item.hint && <dd className="mt-1 truncate text-[10.5px] text-navy-400 sm:text-[11.5px]">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
