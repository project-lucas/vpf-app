"use client";

import { useId } from "react";

/**
 * L'avatar de Jarvis : un casque d'armure (création originale, dans l'esprit
 * des assistants de films de super-héros) — coque rouge brillante, masque
 * doré nervuré, deux fentes d'yeux bleu glacier qui s'illuminent. En continu :
 * un halo cyan respire, les yeux pulsent comme un réacteur et clignent ;
 * `thinking` les fait vaciller pendant qu'il travaille. Animations en CSS
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
  // identifiants propres à chaque avatar : plusieurs peuvent cohabiter
  const uid = useId().replace(/:/g, "");
  const shell = `js-${uid}`;
  const plate = `jp-${uid}`;
  const glow = `jg-${uid}`;
  const shine = `jh-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Jarvis"
      className={`shrink-0 overflow-visible ${className}`}
    >
      <defs>
        <linearGradient id={shell} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ef4a4f" />
          <stop offset="55%" stopColor="#b5161f" />
          <stop offset="100%" stopColor="#6b0b12" />
        </linearGradient>
        <linearGradient id={plate} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe39a" />
          <stop offset="50%" stopColor="#f0b84a" />
          <stop offset="100%" stopColor="#b98120" />
        </linearGradient>
        <radialGradient id={shine} cx="0.32" cy="0.18" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={glow} x="-100%" y="-300%" width="300%" height="700%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* halo qui respire */}
      <circle className="jarvis-ring" cx="24" cy="24" r="23" fill="none" stroke="#5ee7ff" strokeWidth="1.8" />

      {/* coque du casque */}
      <path
        d="M24 2.8c9.3 0 15.8 5.6 15.8 15v9.2c0 7.4-3.9 13-9.9 16L24 46l-5.9-3C12.1 40 8.2 34.4 8.2 27V17.8c0-9.4 6.5-15 15.8-15z"
        fill={`url(#${shell})`}
        stroke="#4a070c"
        strokeWidth="0.8"
      />
      {/* oreilles / attaches latérales */}
      <path d="M8.6 21.5l2.6.8v7.4l-2.4 1.2" fill="#8f121a" />
      <path d="M39.4 21.5l-2.6.8v7.4l2.4 1.2" fill="#8f121a" />

      {/* masque doré */}
      <path
        d="M24 9.6c6.1 0 10.3 3.2 10.3 9.1v6.8c0 2.6-.8 4.1-2.1 5.6l-1.8 1.9v5.2L24 40.8l-6.4-2.6V33l-1.8-1.9c-1.3-1.5-2.1-3-2.1-5.6v-6.8c0-5.9 4.2-9.1 10.3-9.1z"
        fill={`url(#${plate})`}
        stroke="#8a5d12"
        strokeWidth="0.7"
      />
      {/* nervures du masque */}
      <path d="M24 9.8v7.2" stroke="#b07f22" strokeWidth="0.9" />
      <path d="M17.2 27.4l2.8 2.2M30.8 27.4l-2.8 2.2" stroke="#a87418" strokeWidth="0.9" strokeLinecap="round" />
      {/* bouche */}
      <path d="M20 34.2h8" stroke="#7a520e" strokeWidth="1.3" strokeLinecap="round" />

      {/* reflet de la coque */}
      <ellipse cx="18" cy="9.5" rx="8" ry="4.5" fill={`url(#${shine})`} />

      {/* yeux : fentes lumineuses */}
      <g className={`jarvis-eyes ${thinking ? "thinking" : ""}`} filter={`url(#${glow})`}>
        <path className="jarvis-eye jarvis-eye-glow" d="M15.2 23.2l6.6 1.4-.5 2-5.8-.8z" fill="#e6fdff" />
        <path className="jarvis-eye jarvis-eye-glow" d="M32.8 23.2l-6.6 1.4.5 2 5.8-.8z" fill="#e6fdff" />
      </g>
    </svg>
  );
}
