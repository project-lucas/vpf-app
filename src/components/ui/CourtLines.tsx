/**
 * Demi-terrain vu du dessus, tracé au trait : ligne de fond, raquette, cercle
 * des lancers francs, arc à trois points. Posé en filigrane derrière les titres
 * de page — la signature basket de l'interface staff, sans un pixel de décor
 * qui gêne la lecture.
 *
 * `currentColor` : la teinte et l'opacité se règlent par la classe du parent.
 */
export function CourtLines({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 120"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {/* ligne de fond et lignes de touche */}
      <path d="M 2 118 H 198" />
      <path d="M 2 118 V 20" />
      <path d="M 198 118 V 20" />
      {/* raquette */}
      <rect x="70" y="58" width="60" height="60" />
      {/* cercle des lancers francs */}
      <circle cx="100" cy="58" r="18" />
      {/* arc à trois points */}
      <path d="M 12 118 V 96 A 88 88 0 0 1 188 96 V 118" />
      {/* panneau et cercle */}
      <path d="M 88 108 H 112" />
      <circle cx="100" cy="111" r="3" />
    </svg>
  );
}
