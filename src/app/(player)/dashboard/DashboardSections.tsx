"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { BallIcon, ChartIcon, FlameIcon, TrophyIcon } from "@/components/icons";

type SectionKey = "progression" | "stats" | "records" | "matchs" | "habitudes";

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionDef[] = [
  { key: "progression", label: "Progression", icon: <Zap size={20} strokeWidth={1.8} /> },
  { key: "stats", label: "Stats", icon: <ChartIcon size={20} /> },
  { key: "records", label: "Records", icon: <TrophyIcon size={20} /> },
  { key: "matchs", label: "Matchs", icon: <BallIcon size={20} /> },
  { key: "habitudes", label: "Habitudes", icon: <FlameIcon size={20} /> },
];

/**
 * Barre de 5 icônes dépliables (accordéon) : un tap ouvre le panneau de la
 * section sous la barre, un re-tap le referme, une seule section ouverte à la
 * fois. Seul le panneau ouvert est monté — les célébrations (confetti badge)
 * se jouent donc à l'ouverture de la section, pas en fond.
 */
export function DashboardSections({
  progression,
  stats,
  records,
  matchs,
  habitudes,
  initialOpen = null,
  autoScroll = false,
}: Record<SectionKey, React.ReactNode> & {
  initialOpen?: SectionKey | null;
  /** amène le panneau ouvert à l'écran au montage (raccourci ?section=…) */
  autoScroll?: boolean;
}) {
  const [open, setOpen] = useState<SectionKey | null>(initialOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const panels: Record<SectionKey, React.ReactNode> = {
    progression,
    stats,
    records,
    matchs,
    habitudes,
  };

  // Arrivée via un raccourci (?section=…) : amène le panneau ouvert à l'écran.
  // L'ouverture par défaut (Progression), elle, ne déclenche aucun défilement.
  useEffect(() => {
    if (autoScroll && !scrolled.current) {
      scrolled.current = true;
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [autoScroll]);

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {SECTIONS.map((s) => {
          const active = open === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setOpen((o) => (o === s.key ? null : s.key))}
              aria-expanded={active}
              aria-controls="dashboard-section-panel"
              className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 px-0.5 py-2 transition-colors duration-200 ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-ink bg-card text-meta hover:bg-ink/5"
              }`}
            >
              {s.icon}
              <span className={`ed-meta text-[8px] ${active ? "text-paper" : "text-meta"}`}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        // key={open} force le remontage au changement de section : l'animation
        // d'ouverture se rejoue et l'état interne du panneau repart à zéro
        <div
          key={open}
          ref={panelRef}
          id="dashboard-section-panel"
          className="animate-slide-down mt-2 scroll-mt-24"
        >
          <div className="rounded-md border-2 border-ink bg-card p-4">{panels[open]}</div>
        </div>
      )}
    </div>
  );
}

/** Sous-onglets du panneau Stats : courbe de croissance / profil joueur (radar). */
export function StatsTabs({
  growth,
  radar,
}: {
  growth: React.ReactNode;
  radar: React.ReactNode;
}) {
  const [tab, setTab] = useState<"growth" | "radar">("growth");

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-md border-2 border-ink bg-paper p-1">
        {(
          [
            { key: "growth", label: "Croissance" },
            { key: "radar", label: "Graphique Radar" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`ed-meta flex-1 cursor-pointer rounded-sm px-3 py-1.5 text-[10px] transition-colors duration-200 ${
              tab === t.key ? "bg-ink text-paper" : "text-meta hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "growth" ? growth : radar}
    </div>
  );
}
