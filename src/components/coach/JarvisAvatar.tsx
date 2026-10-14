/**
 * L'avatar de Jarvis : un casque d'armure (création originale, dans l'esprit
 * des assistants de films de super-héros) — coque rouge, masque doré, deux
 * fentes d'yeux qui s'illuminent. En continu : un halo cyan respire autour,
 * les yeux pulsent, balaient de temps en temps et clignent. `thinking` fait
 * vaciller les yeux pendant qu'il travaille. Animations en CSS (globals.css),
 * coupées si l'utilisateur demande moins de mouvement.
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
        <linearGradient id="jarvis-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4313b" />
          <stop offset="100%" stopColor="#7d1219" />
        </linearGradient>
        <linearGradient id="jarvis-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6d27a" />
          <stop offset="100%" stopColor="#c9952f" />
        </linearGradient>
        <filter id="jarvis-glow" x="-80%" y="-200%" width="260%" height="500%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* halo qui respire */}
      <circle className="jarvis-ring" cx="20" cy="20" r="19" fill="none" stroke="#5ee7ff" strokeWidth="1.6" />

      {/* coque du casque */}
      <path
        d="M20 2.5c7.6 0 13 4.6 13 12.4v7.4c0 6.2-3.3 10.9-8.2 13.4L20 38l-4.8-2.3C10.3 33.2 7 28.5 7 22.3v-7.4C7 7.1 12.4 2.5 20 2.5z"
        fill="url(#jarvis-shell)"
      />
      {/* masque doré */}
      <path
        d="M20 8.5c4.9 0 8.4 2.6 8.4 7.4v5.6c0 2.2-.6 3.4-1.7 4.6l-1.5 1.6v4.2L20 34l-5.2-2.1v-4.2l-1.5-1.6c-1.1-1.2-1.7-2.4-1.7-4.6v-5.6c0-4.8 3.5-7.4 8.4-7.4z"
        fill="url(#jarvis-plate)"
      />
      {/* arête du front */}
      <path d="M20 8.5v6.2" stroke="#b07f22" strokeWidth="0.8" />
      {/* bouche */}
      <path d="M16.6 28.6h6.8" stroke="#8a6214" strokeWidth="1.1" strokeLinecap="round" />

      {/* yeux : fentes lumineuses */}
      <g className={`jarvis-eyes ${thinking ? "thinking" : ""}`} filter="url(#jarvis-glow)">
        <path className="jarvis-eye jarvis-eye-glow" d="M12.6 19.4l5.2 1.1-.4 1.6-4.6-.6z" fill="#d9fbff" />
        <path className="jarvis-eye jarvis-eye-glow" d="M27.4 19.4l-5.2 1.1.4 1.6 4.6-.6z" fill="#d9fbff" />
      </g>
    </svg>
  );
}
