"use client";

/**
 * Interrupteur rétro : piste navy cerclée, pastille rouge brique.
 * ON = piste navy pleine + pastille à droite ; OFF = piste tan + pastille à gauche.
 *
 * `tone="navy"` reprend la même mécanique dans le langage des écrans staff
 * (blanc/navy) : le tan crème du thème joueur détonnerait sur une carte blanche.
 */
export function EditorialSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  tone = "editorial",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  tone?: "editorial" | "navy";
}) {
  const navy = tone === "navy";
  const track = navy
    ? `border-navy-200 ${checked ? "bg-navy-800" : "bg-navy-50"}`
    : `border-ink ${checked ? "bg-ink" : "bg-tan"}`;
  const knob = navy ? (checked ? "bg-white" : "bg-navy-300") : "bg-orange";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full border-2 transition-colors disabled:opacity-40 ${track}`}
    >
      <span
        aria-hidden
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all ${knob} ${
          checked ? "left-[calc(100%-4px)] -translate-x-full" : "left-1"
        }`}
      />
    </button>
  );
}
