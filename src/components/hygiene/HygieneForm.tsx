"use client";

import { useState } from "react";
import { saveHygieneLog } from "@/app/actions/hygiene";
import { EdButton } from "@/components/editorial/forms";
import { CheckIcon } from "@/components/icons";
import {
  HYGIENE_CRITERIA,
  HYGIENE_MAX,
  SLEEP_MAX_HOURS,
  SLEEP_MIN_HOURS,
  formatHours,
} from "@/lib/hygiene";
import type { HygieneCriterion, HygieneLog } from "@/lib/types";

/** Nuits les plus courantes : un seul tap suffit dans la grande majorité des cas. */
const QUICK_HOURS = [6, 7, 8, 9, 10];
/** Point de départ des boutons ±30 min quand rien n'est encore choisi. */
const SLEEP_DEFAULT_HOURS = 8;

type Scores = Record<HygieneCriterion, number | null>;

/**
 * Sommeil : raccourcis à l'heure pleine (un tap) + ajustement ±30 min pour les
 * valeurs intermédiaires (7h30…). Bornes : SLEEP_MIN_HOURS → SLEEP_MAX_HOURS.
 */
function SleepPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (hours: number) => void;
}) {
  const step = (delta: number) => {
    const next = (value ?? SLEEP_DEFAULT_HOURS) + delta;
    onChange(Math.min(SLEEP_MAX_HOURS, Math.max(SLEEP_MIN_HOURS, next)));
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="ed-overline">Sommeil de la nuit dernière</p>
        <p className="ed-value text-sm text-orange">
          {value === null ? "—" : formatHours(value)}
        </p>
      </div>

      <div role="group" aria-label="Heures de sommeil" className="mt-2 grid grid-cols-5 gap-1.5">
        {QUICK_HOURS.map((hours) => {
          const active = value === hours;
          return (
            <button
              key={hours}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(hours)}
              className={`ed-value h-11 rounded-md border-2 text-base transition-colors ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/40 bg-card text-ink hover:border-ink"
              }`}
            >
              {hours}h
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => step(-0.5)}
          disabled={value !== null && value <= SLEEP_MIN_HOURS}
          className="ed-meta h-9 flex-1 rounded-md border-2 border-ink/40 bg-card text-[11px] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          − 30 min
        </button>
        <button
          type="button"
          onClick={() => step(0.5)}
          disabled={value !== null && value >= SLEEP_MAX_HOURS}
          className="ed-meta h-9 flex-1 rounded-md border-2 border-ink/40 bg-card text-[11px] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          + 30 min
        </button>
      </div>
    </div>
  );
}

/** Rangée de 5 boutons de notation (1 → 5). */
function ScoreRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (score: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="ed-overline">{label}</p>
        <p className="ed-value text-sm text-orange">{value === null ? "—" : `${value}/5`}</p>
      </div>
      <div role="group" aria-label={label} className="mt-2 grid grid-cols-5 gap-1.5">
        {Array.from({ length: HYGIENE_MAX }, (_, i) => i + 1).map((score) => {
          const active = value === score;
          return (
            <button
              key={score}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(score)}
              className={`ed-value h-11 rounded-md border-2 text-base transition-colors ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/40 bg-card text-ink hover:border-ink"
              }`}
            >
              {score}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 font-body text-[11px] text-muted">{hint}</p>
    </div>
  );
}

/**
 * Saisie du jour : heures de sommeil de la veille + quatre notes sur 5.
 * Re-saisir le même jour écrase la note précédente (une ligne par jour).
 *
 * Deux points d'entrée pour le même formulaire : l'onglet Hygiène (encadré) et
 * la mission du jour du planning (dans une modale, donc `frameless`).
 */
export function HygieneForm({
  date,
  dateLabel,
  initial,
  frameless = false,
  onSaved,
}: {
  date: string;
  dateLabel: string;
  initial: HygieneLog | null;
  /** sans cadre : la modale de la mission du jour en fournit déjà un */
  frameless?: boolean;
  /** appelé après un enregistrement réussi (mission du jour : coche + fermeture) */
  onSaved?: () => void;
}) {
  const [sleep, setSleep] = useState<number | null>(
    initial ? Number(initial.sleep_hours) : null
  );
  const [scores, setScores] = useState<Scores>({
    hydration: initial?.hydration ?? null,
    carbs: initial?.carbs ?? null,
    proteins: initial?.proteins ?? null,
    vitamins: initial?.vitamins ?? null,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete =
    sleep !== null &&
    scores.hydration !== null &&
    scores.carbs !== null &&
    scores.proteins !== null &&
    scores.vitamins !== null;

  const touch = () => {
    setSaved(false);
    setError(null);
  };

  const setScore = (key: HygieneCriterion, score: number) => {
    touch();
    setScores((prev) => ({ ...prev, [key]: score }));
  };

  async function handleSubmit() {
    const { hydration, carbs, proteins, vitamins } = scores;
    if (
      loading ||
      sleep === null ||
      hydration === null ||
      carbs === null ||
      proteins === null ||
      vitamins === null
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const result = await saveHygieneLog(date, {
      sleepHours: sleep,
      hydration,
      carbs,
      proteins,
      vitamins,
    });
    setLoading(false);
    if (result.ok) {
      setSaved(true);
      onSaved?.();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className={frameless ? "" : "rounded-lg border-2 border-ink bg-card p-4"}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="ed-value text-lg text-ink">{dateLabel}</p>
        {initial && !saved && <p className="ed-meta text-[10px] text-meta">Déjà noté</p>}
      </div>

      <div className="mt-4">
        <SleepPicker
          value={sleep}
          onChange={(hours) => {
            touch();
            setSleep(hours);
          }}
        />
      </div>

      <div className="mt-5 space-y-5">
        {HYGIENE_CRITERIA.map((criterion) => (
          <ScoreRow
            key={criterion.key}
            label={criterion.label}
            hint={criterion.hint}
            value={scores[criterion.key]}
            onChange={(score) => setScore(criterion.key, score)}
          />
        ))}
      </div>

      {error && <p className="mt-4 font-body text-sm text-danger">{error}</p>}

      <EdButton
        variant={saved ? "ghost" : "red"}
        full
        className="mt-5"
        disabled={!complete || loading}
        onClick={handleSubmit}
      >
        {loading ? (
          "Enregistrement…"
        ) : saved ? (
          <>
            <CheckIcon size={18} /> Noté
          </>
        ) : initial ? (
          "Corriger ma note du jour"
        ) : (
          "Valider ma journée"
        )}
      </EdButton>
    </div>
  );
}
