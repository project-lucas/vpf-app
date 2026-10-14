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
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:var(--cols)] ${className}`}
      style={{ ["--cols" as string]: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div key={item.label} className="shadow-soft min-w-0 rounded-[18px] bg-white px-4 py-3.5">
          <dt className="truncate text-[12px] font-semibold text-navy-400">{item.label}</dt>
          <dd
            className={`font-display mt-1 text-[32px] font-extrabold leading-none tabular-nums ${VALUE_TONES[item.tone ?? "default"]}`}
          >
            {item.value}
          </dd>
          {item.hint && <dd className="mt-1 truncate text-[11.5px] text-navy-400">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
