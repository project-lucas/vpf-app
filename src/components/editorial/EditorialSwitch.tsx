"use client";

/**
 * Interrupteur rétro : piste navy cerclée, pastille rouge brique.
 * ON = piste navy pleine + pastille à droite ; OFF = piste tan + pastille à gauche.
 */
export function EditorialSwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-40 ${
        checked ? "bg-ink" : "bg-tan"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-orange transition-all ${
          checked ? "left-[calc(100%-4px)] -translate-x-full" : "left-1"
        }`}
      />
    </button>
  );
}
