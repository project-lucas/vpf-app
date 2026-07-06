// Étincelles : taille 2-4px, couleurs de flamme, départs et dérives décalés
// pour que la boucle ne semble jamais se répéter
const SPARKS = [
  { size: 3, color: "#FFCC4D", left: "38%", top: 6, delay: 0, drift: -6 },
  { size: 2, color: "#F4900C", left: "56%", top: 10, delay: 0.35, drift: 5 },
  { size: 4, color: "#FFAC33", left: "30%", top: 12, delay: 0.6, drift: -4 },
  { size: 2, color: "#FFCC4D", left: "66%", top: 8, delay: 0.9, drift: 7 },
  { size: 3, color: "#F4900C", left: "48%", top: 3, delay: 1.2, drift: 2 },
];

/**
 * Flamme de série du header Planning : elle brûle tant que la série de jours
 * complets tient. Deux couches désynchronisées ondulent, des étincelles
 * s'échappent vers le haut et un halo orange pulse derrière l'ensemble. Rien
 * ne s'affiche sous 1 jour de série — c'est la récompense visuelle de la
 * chaîne en cours.
 */
export function StreakFlame({ streak }: { streak: number }) {
  if (streak < 1) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="relative flex h-[60px] w-[52px] items-center justify-center">
        {/* halo orange pulsant derrière l'ensemble */}
        <span
          aria-hidden
          className="animate-streak-glow absolute bottom-1.5 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full"
        />

        {/* Tracés de la flamme : Twemoji 1f525 (© Twitter, CC-BY 4.0) —
            silhouette emoji authentique avec ses langues organiques. Deux
            couches (corps orange + cœur jaune ancré à la base) qui ondulent
            en léger décalé. */}
        <svg width={46} height={46} viewBox="0 0 36 36" fill="none" aria-hidden>
          <g className="animate-streak-flame">
            <path
              d="M35 19c0-2.062-.367-4.039-1.04-5.868-.46 5.389-3.333 8.157-6.335 6.868-2.812-1.208-.917-5.917-.777-8.164.236-3.809-.012-8.169-6.931-11.794 2.875 5.5.333 8.917-2.333 9.125-2.958.231-5.667-2.542-4.667-7.042-3.238 2.386-3.332 6.402-2.333 9 1.042 2.708-.042 4.958-2.583 5.208-2.84.28-4.418-3.041-2.963-8.333C2.52 10.965 1 14.805 1 19c0 9.389 7.611 17 17 17s17-7.611 17-17z"
              fill="#F4900C"
            />
          </g>
          <g className="animate-streak-flame" style={{ animationDelay: "-0.5s" }}>
            <path
              d="M28.394 23.999c.148 3.084-2.561 4.293-4.019 3.709-2.106-.843-1.541-2.291-2.083-5.291s-2.625-5.083-5.708-6c2.25 6.333-1.247 8.667-3.08 9.084-1.872.426-3.753-.001-3.968-4.007C7.352 23.668 6 26.676 6 30c0 .368.023.73.055 1.09C9.125 34.124 13.342 36 18 36s8.875-1.876 11.945-4.91c.032-.36.055-.722.055-1.09 0-2.187-.584-4.236-1.606-6.001z"
              fill="#FFCC4D"
            />
          </g>
        </svg>

        {/* étincelles qui montent du sommet et s'évanouissent */}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="animate-spark absolute rounded-full"
            style={
              {
                width: s.size,
                height: s.size,
                left: s.left,
                top: s.top,
                backgroundColor: s.color,
                animationDelay: `${s.delay}s`,
                "--sx": `${s.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>

      <span className="text-4xl font-extrabold tabular-nums text-navy-900">{streak}</span>
    </div>
  );
}
