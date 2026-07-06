// Primitives de la direction « Retro Varsity » (écrans joueur).
// Club de basket vintage : papier crème, encre navy, rouge brique en accent.
// Coins 6–8px, bordures navy 2px, filets doubles, gros chiffres block Archivo,
// citations serif italique. Purement présentationnel — aucune logique métier.

import type { ReactNode } from "react";

/** Surtitre / label en mono rouge majuscule espacé. */
export function Overline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`ed-overline ${className}`}>{children}</p>;
}

/** Titre varsity Archivo (MAJUSCULES, block navy). */
export function DisplayTitle({
  children,
  className = "",
  as: Tag = "h1",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "p";
}) {
  return <Tag className={`ed-display ${className}`}>{children}</Tag>;
}

/** Nom / citation en serif d'affichage italique. */
export function Serif({
  children,
  className = "",
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "p" | "span";
}) {
  return <Tag className={`ed-serif ${className}`}>{children}</Tag>;
}

/** Citation serif entre guillemets « … ». */
export function Quote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`ed-serif ${className}`}>
      <span aria-hidden>«&nbsp;</span>
      {children}
      <span aria-hidden>&nbsp;»</span>
    </p>
  );
}

/** Filet simple (2px navy) ou fin. */
export function Rule({ thin = false, className = "" }: { thin?: boolean; className?: string }) {
  return <hr className={`${thin ? "ed-rule-thin" : "ed-rule"} ${className}`} />;
}

/** Filet double sous les en-têtes : trait épais + trait fin. */
export function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="border-t-2 border-ink" />
      <div className="mt-[3px] border-t border-ink" />
    </div>
  );
}

/**
 * En-tête de section : label mono rouge + filet qui remplit la ligne.
 * (icône optionnelle à gauche du label).
 */
export function SectionHead({
  children,
  icon,
  className = "",
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="ed-overline flex items-center gap-1.5">
        {icon}
        {children}
      </span>
      <span aria-hidden className="h-px flex-1 bg-ink/25" />
    </div>
  );
}

/** Ligne étoilée ★ … ★ (message de célébration). */
export function StarLine({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`ed-meta flex items-center justify-center gap-2 text-orange ${className}`}>
      <span aria-hidden>★</span>
      <span>{children}</span>
      <span aria-hidden>★</span>
    </p>
  );
}

/**
 * Écusson rond : navy cerclé de rouge, initiales block + ligne club·numéro.
 */
export function Badge({
  initials,
  tag,
  size = 56,
}: {
  initials: string;
  tag?: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-orange bg-ink text-paper"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="ed-value text-lg leading-none">{initials}</span>
      {tag && <span className="ed-meta mt-0.5 text-[6px] leading-none text-warm">{tag}</span>}
    </span>
  );
}

/**
 * Bloc héros navy avec liseré crème intérieur : réceptacle des gros chiffres
 * (série, points par match). Le contenu est composé par l'écran.
 */
export function HeroBlock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-ink p-1.5 ${className}`}>
      <div className="relative overflow-hidden rounded-md border border-warm/30 px-5 py-4">
        <CourtBackdrop />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

/** Terrain de basket rétro complet (vue de dessus), tracé en lignes crème
 *  discrètes et symétriques : deux paniers, raquettes, arcs à 3 points, ligne
 *  et rond central. Fond décoratif du bloc « Points par match ». */
function CourtBackdrop() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 480 150"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full text-warm/30"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* Ligne médiane + rond central */}
        <line x1="240" y1="8" x2="240" y2="142" />
        <circle cx="240" cy="75" r="30" />

        {/* --- Côté gauche : raquette, cercle LF, arc 3 pts, panier --- */}
        <rect x="6" y="49" width="80" height="52" />
        <path d="M86 49 A26 26 0 0 1 86 101" />
        <path d="M6 20 L44 20 A152 152 0 0 1 44 130 L6 130" />
        <line x1="15" y1="63" x2="15" y2="87" strokeWidth="2.4" />
        <circle cx="23" cy="75" r="6" />

        {/* --- Côté droit : miroir --- */}
        <rect x="394" y="49" width="80" height="52" />
        <path d="M394 49 A26 26 0 0 0 394 101" />
        <path d="M474 20 L436 20 A152 152 0 0 0 436 130 L474 130" />
        <line x1="465" y1="63" x2="465" y2="87" strokeWidth="2.4" />
        <circle cx="457" cy="75" r="6" />
      </g>
    </svg>
  );
}

/** Case statistique : bordure navy, gros chiffre block, label mono.
 *  `tone` colore le cadre : "technique" (navy) / "physique" (rouge brique) —
 *  le texte reste toujours lisible (chiffre + label passent en crème). */
export function StatBox({
  value,
  label,
  accent = false,
  tone = "default",
}: {
  value: ReactNode;
  label: ReactNode;
  accent?: boolean;
  tone?: "default" | "technique" | "physique";
}) {
  const toned = tone !== "default";
  const box =
    tone === "technique"
      ? "border-ink bg-ink"
      : tone === "physique"
        ? "border-[#7d2118] bg-orange"
        : "border-ink bg-card";
  const valueColor = toned ? "text-paper" : accent ? "text-orange" : "text-ink";
  const labelColor = toned ? "text-paper/80" : "text-meta";
  return (
    <div className={`rounded-md border-2 px-2 py-3 text-center ${box}`}>
      <p className={`ed-value text-[26px] ${valueColor}`}>{value}</p>
      <p className={`ed-meta mt-1.5 text-[8px] ${labelColor}`}>{label}</p>
    </div>
  );
}

/**
 * Ligne d'index : numéro rouge · label mono · valeur (rouge par défaut).
 */
export function IndexRow({
  index,
  label,
  value,
  last = false,
}: {
  index: string;
  label: ReactNode;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-2.5 ${last ? "" : "border-b border-hair"}`}>
      <span className="ed-meta shrink-0 text-orange">{index}</span>
      <span className="ed-meta flex-1 truncate text-ink">{label}</span>
      <span className="ed-meta shrink-0 text-orange">{value}</span>
    </div>
  );
}

/** Grosse métrique block : chiffre géant + label mono. */
export function StatBig({
  value,
  label,
  className = "",
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center ${className}`}>
      <p className="ed-value text-[72px] text-ink">{value}</p>
      <p className="ed-overline mt-1">{label}</p>
    </div>
  );
}

/** Piste d'XP bordée navy, remplissage rouge, valeur block à droite. */
export function XpBar({
  value,
  max,
  className = "",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="ed-meta shrink-0 text-ink">XP</span>
      <div
        className="relative h-4 flex-1 overflow-hidden rounded-full border-2 border-ink bg-card"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="absolute inset-y-0 left-0 bg-orange" style={{ width: `${pct}%` }} />
      </div>
      <span className="ed-value shrink-0 text-lg text-ink">
        {value}/{max}
      </span>
    </div>
  );
}

/**
 * Case trophée. Débloqué = fond navy + chiffre ambre ; verrouillé = crème
 * bordé navy + tiret désactivé.
 */
export function TrophyChip({
  value,
  label,
  unlocked,
}: {
  value: ReactNode;
  label: ReactNode;
  unlocked: boolean;
}) {
  return (
    <div
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 p-1 ${
        unlocked ? "border-ink bg-ink" : "border-ink/40 bg-card"
      }`}
    >
      <span className={`ed-value text-xl ${unlocked ? "text-warm" : "text-muted"}`}>
        {unlocked ? value : "—"}
      </span>
      <span
        className={`ed-meta text-center text-[7px] leading-tight ${
          unlocked ? "text-paper" : "text-muted"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/** Bouton icône carré 44px, coins 6px, bordure navy. */
export function SquareIconButton({
  children,
  filled = false,
  className = "",
  ...props
}: {
  children: ReactNode;
  filled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink transition-colors ${
        filled ? "bg-ink text-paper" : "bg-card text-ink hover:bg-ink/5"
      } disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
