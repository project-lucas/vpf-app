"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";

// Palette du tableau d'affichage (spec)
const NAVY = "#152C3A";
const EYELET = "#0d1e28";
const CREAM = "#F0E4CC";
const PEACH = "#E8A87C";
const RED = "#D8604F";
const HAIR = "rgba(240,228,204,.22)";
const ARCHIVO = "var(--font-cond)";
const MONO = "var(--font-mono-ed)";

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** Un carton (volet mécanique) affichant un chiffre, qui bascule quand il change. */
function FlipCard({
  char,
  delay,
  reduce,
  mountedRef,
  small = false,
  color = CREAM,
}: {
  char: string;
  delay: number;
  reduce: boolean;
  mountedRef: MutableRefObject<boolean>;
  /** variante réduite pour le bandeau 3 stats */
  small?: boolean;
  /** couleur du chiffre (le bandeau code chaque stat par couleur) */
  color?: string;
}) {
  const [display, setDisplay] = useState(char);
  const [rot, setRot] = useState(0);
  const [ease, setEase] = useState<"none" | "in" | "out">("none");
  const [flipping, setFlipping] = useState(false);
  // enter animation seulement pour les cartons ajoutés après le 1er rendu
  const [entered] = useState(() => mountedRef.current);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prev = useRef(char);

  useEffect(() => {
    if (char === prev.current) return;
    prev.current = char;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (reduce) {
      // crossfade : le changement de `key` relance l'anim sb-fade (300ms)
      setDisplay(char);
      return;
    }

    const push = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    push(() => {
      // 1) l'ancien chiffre se replie : rotateX 0 → -90deg (ease-in, 600ms)
      setFlipping(true);
      setEase("out");
      requestAnimationFrame(() => setRot(-90));
      // 2) à mi-parcours (carton sur la tranche) : nouveau chiffre + saut à +90
      push(() => {
        setDisplay(char);
        setEase("none");
        setRot(90);
        // 3) le nouveau chiffre se déplie : rotateX 90 → 0 (ease-out, 600ms)
        requestAnimationFrame(() => {
          setEase("in");
          setRot(0);
        });
        push(() => {
          setEase("none");
          setFlipping(false);
        }, 600);
      }, 600);
    }, delay);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [char, delay, reduce]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const transition =
    ease === "out"
      ? "transform 600ms ease-in, box-shadow 600ms ease-in"
      : ease === "in"
        ? "transform 600ms ease-out, box-shadow 600ms ease-out"
        : "box-shadow 300ms ease-out";

  return (
    <div
      className={entered ? "sb-card-enter" : undefined}
      style={{
        perspective: small ? "200px" : "340px",
        width: small ? 30 : 58,
        height: small ? 42 : 76,
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: small ? 5 : 7,
          border: `${small ? 1 : 1.5}px solid rgba(240,228,204,.25)`,
          background:
            "linear-gradient(to bottom, #26414f 0%, #26414f 50%, #1e3541 50%, #1e3541 100%)",
          boxShadow: flipping
            ? "0 8px 16px rgba(0,0,0,.5)"
            : small
              ? "0 2px 5px rgba(0,0,0,.35)"
              : "0 4px 8px rgba(0,0,0,.35)",
          transform: `rotateX(${rot}deg)`,
          transformOrigin: "center center",
          transition,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          willChange: "transform",
        }}
      >
        <span
          key={display}
          className="sb-digit"
          style={{
            fontFamily: ARCHIVO,
            fontWeight: 900,
            fontSize: small ? 22 : 46,
            lineHeight: 1,
            color,
          }}
        >
          {display}
        </span>
        {/* pli central du volet */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 1,
            background: "rgba(0,0,0,.45)",
          }}
        />
      </div>
    </div>
  );
}

/** Point décimal (pas un carton) : Archivo 900 40px pêche, aligné en bas. */
function Decimal() {
  return (
    <span
      aria-hidden
      style={{
        fontFamily: ARCHIVO,
        fontWeight: 900,
        fontSize: 40,
        lineHeight: 1,
        color: PEACH,
        alignSelf: "flex-end",
        paddingBottom: 6,
      }}
    >
      .
    </span>
  );
}

function Eyelet() {
  return (
    <span
      aria-hidden
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: EYELET,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,.75)",
        flex: "0 0 auto",
      }}
    />
  );
}

/**
 * Colonne du bandeau : la valeur en petits cartons à volet (même mécanique que
 * le score moyen), libellé pêche + sous-libellé, chiffres codés par couleur.
 */
function StatCol({
  value,
  suffix,
  label,
  sublabel,
  color,
  reduce,
  delay,
  mountedRef,
}: {
  value: number | null;
  suffix?: string;
  label: string;
  sublabel: string;
  color: string;
  reduce: boolean;
  /** décalage de base de la colonne (les volets partent en vague g → d) */
  delay: number;
  mountedRef: MutableRefObject<boolean>;
}) {
  const chars = value !== null ? String(value).split("") : [];

  // Célébration quand la stat MONTE : halo coloré + « +N » qui s'envole,
  // déclenchés au moment où le volet retombe (delay + demi-flip).
  const [bump, setBump] = useState<number | null>(null);
  const prevValue = useRef(value);
  useEffect(() => {
    const old = prevValue.current;
    prevValue.current = value;
    if (reduce || old === null || value === null || value <= old) return;
    const delta = value - old;
    const show = setTimeout(() => setBump(delta), delay + 600);
    const hide = setTimeout(() => setBump(null), delay + 600 + 1400);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [value, reduce, delay]);

  return (
    <div
      aria-hidden
      className="flex flex-1 flex-col items-center justify-center px-2 py-3.5"
      style={{ gap: 7 }}
    >
      {value === null ? (
        <span
          style={{
            fontFamily: ARCHIVO,
            fontWeight: 900,
            fontSize: 22,
            lineHeight: "42px",
            color: "rgba(240,228,204,.4)",
          }}
        >
          —
        </span>
      ) : (
        <div className="relative flex items-end justify-center" style={{ gap: 4 }}>
          {bump !== null && (
            <>
              {/* halo coloré derrière les cartons */}
              <span
                className="sb-bump-glow"
                style={{
                  position: "absolute",
                  inset: -10,
                  borderRadius: 14,
                  background: `radial-gradient(closest-side, ${color}55, transparent 72%)`,
                  pointerEvents: "none",
                }}
              />
              {/* « +N » qui s'envole au-dessus du panneau */}
              <span
                className="sb-bump-rise"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: -14,
                  zIndex: 2,
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "1px",
                  color,
                  textShadow: `0 0 12px ${color}`,
                  pointerEvents: "none",
                }}
              >
                +{bump}
              </span>
            </>
          )}
          {chars.map((ch, i) => (
            <FlipCard
              key={`d-${i}`}
              char={ch}
              delay={reduce ? 0 : delay + i * 150}
              reduce={reduce}
              mountedRef={mountedRef}
              small
              color={color}
            />
          ))}
          {suffix && (
            <span
              style={{
                fontFamily: ARCHIVO,
                fontWeight: 900,
                fontSize: 20,
                lineHeight: 1,
                color: PEACH,
                alignSelf: "flex-end",
                paddingBottom: 3,
              }}
            >
              {suffix}
            </span>
          )}
        </div>
      )}
      <span
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: "1.6px",
          textTransform: "uppercase",
          color: PEACH,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 7.5,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "rgba(240,228,204,.45)",
          textAlign: "center",
          lineHeight: 1.3,
          marginTop: -4,
        }}
      >
        {sublabel}
      </span>
    </div>
  );
}

/**
 * Tableau d'affichage de gymnase vintage : la moyenne de points en cartons à
 * volet mécanique (flip au changement), suivi d'un bandeau 3 stats. Front-end
 * pur — la valeur vient des données existantes (moyenne de points, totaux).
 */
export function ScoreBoard({
  average,
  technique,
  jeuMoy,
  physique,
}: {
  average: number | null;
  technique: number;
  jeuMoy: number | null;
  physique: number;
}) {
  const reduce = usePrefersReducedMotion();
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  // pas de match : cartons « – » comme le « — » du bandeau, plutôt qu'un faux 0.0
  const text = average === null ? "-.-" : average.toFixed(1); // ex. "12.0"
  const chars = text.split("");
  let digitIndex = 0;

  return (
    <div className="mt-5">
      {/* Bloc tableau d'affichage */}
      <div
        aria-live="polite"
        style={{
          position: "relative",
          borderRadius: 10,
          background: NAVY,
          padding: "18px 20px 16px",
        }}
      >
        {/* liseré intérieur */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 6,
            border: "1px solid rgba(240,228,204,.28)",
            borderRadius: 6,
            pointerEvents: "none",
          }}
        />

        {/* texte accessible (lu par les lecteurs d'écran) */}
        <span className="sr-only">
          {average === null ? "Pas encore de match enregistré" : `${text} points par match`}
        </span>

        {/* En-tête : œillets + label */}
        <div
          aria-hidden
          className="flex items-center justify-center gap-2.5"
          style={{ marginBottom: 12 }}
        >
          <Eyelet />
          <span
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: PEACH,
            }}
          >
            · Score moyen ·
          </span>
          <Eyelet />
        </div>

        {/* Rangée de cartons */}
        <div
          aria-hidden
          className="flex items-end justify-center"
          style={{ gap: 8 }}
        >
          {chars.map((ch, i) => {
            if (ch === ".") return <Decimal key={`dot-${i}`} />;
            const d = digitIndex++;
            return (
              <FlipCard
                key={`digit-${d}`}
                char={ch}
                delay={reduce ? 0 : d * 150}
                reduce={reduce}
                mountedRef={mountedRef}
              />
            );
          })}
        </div>

        {/* Label */}
        <p
          aria-hidden
          className="text-center"
          style={{
            marginTop: 12,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "2.5px",
            textTransform: "uppercase",
            color: PEACH,
          }}
        >
          Points par match
        </p>
      </div>

      {/* Bandeau 3 stats : cumuls carrière + temps de jeu moyen, même design
          « tableau d'affichage » que le score moyen (cartons à volet) */}
      {/* pas d'overflow:hidden : le « +N » de célébration s'envole au-dessus */}
      <div
        className="relative mt-2.5 flex items-stretch"
        style={{ borderRadius: 10, background: NAVY }}
      >
        {/* liseré intérieur, comme le panneau du score */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 5,
            border: "1px solid rgba(240,228,204,.28)",
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <span className="sr-only">
          {technique} {technique > 1 ? "séances techniques réalisées" : "séance technique réalisée"} au total,
          {jeuMoy !== null ? ` ${Math.round(jeuMoy)} minutes de jeu en moyenne par match,` : ""}
          {" "}
          {physique} {physique > 1 ? "séances physiques réalisées" : "séance physique réalisée"} au total
        </span>
        <StatCol
          value={technique}
          label="Séances tech."
          sublabel="Total réalisé"
          color={CREAM}
          reduce={reduce}
          delay={0}
          mountedRef={mountedRef}
        />
        <div className="my-3 w-px shrink-0" style={{ background: HAIR }} aria-hidden />
        <StatCol
          value={jeuMoy !== null ? Math.round(jeuMoy) : null}
          suffix="′"
          label="Temps de jeu"
          sublabel="Moy. par match"
          color={PEACH}
          reduce={reduce}
          delay={150}
          mountedRef={mountedRef}
        />
        <div className="my-3 w-px shrink-0" style={{ background: HAIR }} aria-hidden />
        <StatCol
          value={physique}
          label="Séances phys."
          sublabel="Total réalisé"
          color={RED}
          reduce={reduce}
          delay={300}
          mountedRef={mountedRef}
        />
      </div>
    </div>
  );
}
