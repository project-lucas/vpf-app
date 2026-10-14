/**
 * L'avatar de Jarvis : un petit visage rond qui respire (halo orange), regarde
 * autour de lui et cligne des yeux, en continu. `thinking` fait aller les yeux
 * de gauche à droite pendant qu'il travaille. Animations en CSS pur
 * (globals.css), coupées si l'utilisateur demande moins de mouvement.
 */
export function JarvisAvatar({
  size = 32,
  thinking = false,
  className = "",
}: {
  size?: number;
  thinking?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Jarvis"
      className={`shrink-0 overflow-visible ${className}`}
    >
      <defs>
        <linearGradient id="jarvis-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e4a7a" />
          <stop offset="100%" stopColor="#0f2a4a" />
        </linearGradient>
      </defs>
      {/* halo qui respire */}
      <circle className="jarvis-ring" cx="20" cy="20" r="18" fill="none" stroke="#e8622c" strokeWidth="2" />
      {/* visage */}
      <circle cx="20" cy="20" r="16" fill="url(#jarvis-face)" />
      {/* reflet */}
      <ellipse cx="14" cy="11.5" rx="5" ry="2.6" fill="#ffffff" opacity="0.12" />
      {/* yeux */}
      <g className={`jarvis-eyes ${thinking ? "thinking" : ""}`}>
        <rect className="jarvis-eye" x="12.6" y="15" width="4" height="6.4" rx="2" fill="#ffffff" />
        <rect className="jarvis-eye" x="23.4" y="15" width="4" height="6.4" rx="2" fill="#ffffff" />
      </g>
      {/* sourire */}
      <path d="M15.5 25.5c1.3 1.5 2.8 2.2 4.5 2.2s3.2-.7 4.5-2.2" fill="none" stroke="#e8622c" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
