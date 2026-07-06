"use client";

import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { BADGE_COLORS, BADGE_ICONS } from "./badges";
import type { BadgeStatus } from "@/lib/gamification";

/**
 * Salle des trophées : la collection complète des badges. Les badges
 * verrouillés restent visibles avec leur progression — le joueur sait
 * toujours ce qu'il lui reste à accomplir.
 */
export function TrophyRoom({
  open,
  onClose,
  badges,
}: {
  open: boolean;
  onClose: () => void;
  badges: BadgeStatus[];
}) {
  const earnedCount = badges.filter((b) => b.earned).length;
  // les badges gagnés d'abord, l'ordre d'origine sinon
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));

  return (
    <Modal open={open} onClose={onClose} title="Salle des trophées">
      <p className="-mt-3 mb-4 text-xs font-semibold text-meta">
        {earnedCount}/{badges.length} badges débloqués
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {sorted.map((b) => {
          const Icon = BADGE_ICONS[b.key];
          const hex = BADGE_COLORS[b.key];
          const pct = b.progress
            ? Math.min(100, Math.round((b.progress.current / b.progress.target) * 100))
            : 0;
          return (
            <div
              key={b.key}
              className={`rounded-md border-2 p-3 ${
                b.earned ? "border-transparent" : "border-ink/30 bg-card"
              }`}
              style={b.earned ? { backgroundColor: `${hex}14` } : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={
                    b.earned
                      ? { backgroundColor: `${hex}24`, color: hex }
                      : { backgroundColor: "#E4D4B4", color: "#A1937A" }
                  }
                >
                  {b.earned ? <Icon size={18} /> : <Lock size={15} />}
                </span>
                <p
                  className={`text-xs font-bold leading-tight ${
                    b.earned ? "text-ink" : "text-meta"
                  }`}
                >
                  {b.label}
                </p>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-meta">{b.description}</p>
              {!b.earned && b.progress && b.progress.current > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: hex }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-meta">
                    {b.progress.current}/{b.progress.target}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
