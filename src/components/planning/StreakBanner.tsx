"use client";

import { useEffect, useRef, useState } from "react";
import { ZapIcon } from "@/components/icons";

/**
 * Bannière de série : éclair vivant (flicker électrique au repos) + gros chiffre.
 * Quand le joueur GAGNE un jour de série, l'éclair envoie une décharge (flash +
 * halo qui se propage) et le chiffre rebondit. La progression est mémorisée par
 * joueur dans localStorage (comme les level-up), pour ne déclencher qu'une fois.
 */
export function StreakBanner({
  streak,
  storageScope,
}: {
  streak: number;
  storageScope: string;
}) {
  const [struck, setStruck] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = `vpf-streak:${storageScope}`;
    let stored: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      stored = raw === null ? null : Number(raw);
    } catch {
      stored = null;
    }

    // 1re visite : on mémorise en silence (pas d'animation surprise).
    if (stored !== null && streak > stored) {
      setStruck(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStruck(false), 1000);
    }
    try {
      localStorage.setItem(key, String(streak));
    } catch {
      /* stockage indisponible : on ignore */
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [streak, storageScope]);

  return (
    <div className="mt-5 flex items-center gap-3.5 py-2">
      <span className="relative flex shrink-0 items-center justify-center">
        {struck && (
          <span
            aria-hidden
            className="animate-zap-ring absolute h-12 w-12 rounded-full border-2 border-orange"
          />
        )}
        <ZapIcon
          size={46}
          className={`text-orange ${struck ? "animate-zap-strike" : "animate-zap-electric"}`}
        />
      </span>
      <span
        className={`ed-value text-[56px] leading-none text-orange ${struck ? "animate-pop" : ""}`}
      >
        {streak}
      </span>
      <span>
        <span className="ed-display block text-[21px] leading-[0.95] text-ink">Jours de suite</span>
        <span className="ed-overline mt-1 block">De progression</span>
      </span>
    </div>
  );
}
