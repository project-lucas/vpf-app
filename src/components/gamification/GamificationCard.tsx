"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Trophy, Zap } from "lucide-react";
import { Confetti } from "@/components/Confetti";
import { recordBeatenFeedback } from "@/lib/feedback";
import { levelTitle, nextLevelTitle, type BadgeStatus, type XpState } from "@/lib/gamification";
import { BADGE_COLORS, BADGE_ICONS } from "./badges";
import { TrophyRoom } from "./TrophyRoom";

const STORAGE_KEY = "vpf-seen-badges";
const LEVEL_KEY = "vpf-seen-level";

/**
 * Niveau + barre d'XP + badges. Un badge qui vient d'être débloqué (absent du
 * localStorage) déclenche confetti + bannière ; une montée de niveau déclenche
 * un overlay plein écran. Une seule fois par appareil et par joueur
 * (storageScope = id utilisateur) ; la première visite initialise en silence.
 */
export function GamificationCard({
  xp,
  badges,
  storageScope,
}: {
  xp: XpState;
  badges: BadgeStatus[];
  storageScope: string;
}) {
  const [freshBadge, setFreshBadge] = useState<BadgeStatus | null>(null);
  const [levelUp, setLevelUp] = useState(false);
  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const [barPct, setBarPct] = useState(0);

  useEffect(() => {
    const key = `${STORAGE_KEY}:${storageScope}`;
    const raw = localStorage.getItem(key);
    const earned = badges.filter((b) => b.earned).map((b) => b.key);
    if (raw === null) {
      // première visite sur cet appareil : on mémorise sans célébrer
      localStorage.setItem(key, JSON.stringify(earned));
      return;
    }
    let seen: string[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) seen = parsed;
    } catch {
      seen = [];
    }
    const fresh = earned.filter((k) => !seen.includes(k));
    localStorage.setItem(key, JSON.stringify(earned));
    if (fresh.length > 0) {
      setFreshBadge(badges.find((b) => b.key === fresh[0]) ?? null);
      const timer = setTimeout(() => setFreshBadge(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [badges, storageScope]);

  // Montée de niveau : comparée au plus haut niveau déjà vu sur cet appareil
  // (l'XP est dérivée : un niveau peut redescendre, on ne re-célèbre pas)
  useEffect(() => {
    const key = `${LEVEL_KEY}:${storageScope}`;
    const prev = Number.parseInt(localStorage.getItem(key) ?? "", 10);
    if (!Number.isFinite(prev)) {
      localStorage.setItem(key, String(xp.level));
      return;
    }
    localStorage.setItem(key, String(Math.max(prev, xp.level)));
    if (xp.level > prev) {
      setLevelUp(true);
      recordBeatenFeedback();
      const timer = setTimeout(() => setLevelUp(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [xp.level, storageScope]);

  // La barre d'XP se remplit à l'affichage (transition CSS de 0 vers pct)
  const pct = Math.min(100, Math.round((xp.levelXp / xp.levelTarget) * 100));
  useEffect(() => {
    const timer = setTimeout(() => setBarPct(pct), 80);
    return () => clearTimeout(timer);
  }, [pct]);

  const earnedCount = badges.filter((b) => b.earned).length;
  // aperçu : les badges gagnés d'abord, complété par les prochains à débloquer
  const preview = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned)).slice(0, 5);
  const next = nextLevelTitle(xp.level);

  return (
    <div>
      {levelUp && <LevelUpOverlay level={xp.level} onClose={() => setLevelUp(false)} />}
      {freshBadge && !levelUp && <Confetti />}
      {freshBadge && (
        <div className="animate-rise mb-3 flex items-center gap-2 rounded-md bg-warm/25 px-3 py-2">
          <Trophy size={16} className="shrink-0 text-orange" />
          <p className="text-xs font-bold text-orange">
            Badge débloqué : {freshBadge.label} !
          </p>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="ed-value text-lg text-ink">Ma progression</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-extrabold text-paper">
          <Zap size={12} className="text-warm" /> Niveau {xp.level} · {levelTitle(xp.level)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-orange transition-all duration-1000 ease-out"
            style={{ width: `${barPct}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-meta">
          {xp.levelXp}/{xp.levelTarget} XP
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {next
          ? `Prochain titre : ${next.title} au niveau ${next.level}.`
          : "Titre maximum atteint — tu écris ta légende."}
      </p>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {preview.map((b) => {
          const Icon = BADGE_ICONS[b.key];
          const hex = BADGE_COLORS[b.key];
          return (
            <button
              key={b.key}
              onClick={() => setTrophiesOpen(true)}
              className="flex cursor-pointer flex-col items-center gap-1 text-center"
              title={`${b.label} — ${b.description}`}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-md transition-transform active:scale-95"
                style={
                  b.earned
                    ? { backgroundColor: `${hex}24`, color: hex }
                    : { backgroundColor: "#E4D4B4", color: "#A1937A" }
                }
              >
                <Icon size={20} />
              </span>
              <span
                className={`text-[9px] font-semibold leading-tight ${
                  b.earned ? "text-ink" : "text-muted"
                }`}
              >
                {b.label}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setTrophiesOpen(true)}
        className="mt-3 flex w-full cursor-pointer items-center justify-between rounded-md bg-ink/10 px-3 py-2.5 transition-colors hover:bg-ink/15 active:scale-[0.99]"
      >
        <span className="inline-flex items-center gap-2 text-xs font-bold text-ink">
          <Trophy size={14} className="text-warm" /> Salle des trophées
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-meta">
          {earnedCount}/{badges.length} <ChevronRight size={14} />
        </span>
      </button>

      <TrophyRoom open={trophiesOpen} onClose={() => setTrophiesOpen(false)} badges={badges} />
    </div>
  );
}

/** Overlay plein écran de montée de niveau : confetti + nouveau titre. */
function LevelUpOverlay({ level, onClose }: { level: number; onClose: () => void }) {
  // portal vers <body> : le panneau accordéon du dashboard s'ouvre avec un
  // transform qui confinerait sinon cet overlay position:fixed à la carte
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/80 p-6"
      onClick={onClose}
      role="button"
      aria-label="Fermer"
    >
      <Confetti count={60} />
      <div className="animate-pop flex flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-warm/20">
          <Zap size={40} className="text-warm" />
        </span>
        <p
          className="ed-display mt-4 text-5xl tracking-wide"
          style={{ color: "var(--color-paper)" }}
        >
          Niveau {level}
        </p>
        <span className="mt-3 rounded-full bg-warm px-4 py-1.5 text-sm font-extrabold uppercase tracking-wider text-ink">
          {levelTitle(level)}
        </span>
        <p className="mt-4 text-xs font-semibold text-paper/70">
          Continue comme ça. Touche l&apos;écran pour continuer.
        </p>
      </div>
    </div>,
    document.body
  );
}
