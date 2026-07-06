"use client";

/**
 * « +N XP » qui s'élève et s'efface au-dessus de l'élément parent (qui doit
 * être en position relative). Remonter burstKey rejoue l'animation ; 0 = rien.
 */
export function XpBurst({ amount, burstKey }: { amount: number; burstKey: number }) {
  if (burstKey === 0) return null;
  return (
    <span
      key={burstKey}
      aria-hidden
      className="animate-xp-burst pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-navy-900/90 px-2 py-0.5 text-[11px] font-extrabold text-gold shadow-md"
    >
      +{amount} XP
    </span>
  );
}
