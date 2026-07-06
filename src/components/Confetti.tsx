"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#f59e0b", "#f97316", "#3b82f6", "#22c55e", "#ec4899", "#8b5cf6", "#14b8a6"];

/** Pluie de confettis plein écran, purement décorative (se termine seule). */
export function Confetti({ count = 44 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.2 + Math.random() * 0.9,
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 5,
        color: COLORS[i % COLORS.length],
      })),
    [count]
  );

  // portal vers <body> : un ancêtre avec transform (animations d'ouverture de
  // panneau) deviendrait sinon le containing block du position:fixed
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute -top-3 block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            rotate: `${p.rotate}deg`,
          }}
        />
      ))}
    </div>,
    document.body
  );
}
