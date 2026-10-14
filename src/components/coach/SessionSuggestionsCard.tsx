"use client";

import { useState, useTransition } from "react";
import { Check, HeartPulse } from "lucide-react";
import { assignSession } from "@/app/actions/coach";
import { parisNow } from "@/lib/dates";
import { WeekdayPicker, weekdaysLabel } from "@/components/coach/WeekdayPicker";
import { Card, CardTitle } from "@/components/ui/Card";
import { ZONE_LABELS, type SessionSuggestion } from "@/lib/session-suggestions";
import { POLE_COLORS } from "@/lib/constants";

/**
 * En tête de l'onglet Programme : les séances à donner à ce joueur, choisies
 * pour son poste et ses douleurs (`suggestSessions`), affectables d'un clic
 * sur les jours cochés. Une séance proposée pour une douleur passe devant,
 * teintée. Plus besoin de piocher dans le catalogue.
 */
export function SessionSuggestionsCard({
  playerId,
  firstName,
  position,
  painNote,
  suggestions,
}: {
  playerId: string;
  firstName: string;
  position: string | null;
  /** « Douleur au dos signalée » : null si rien */
  painNote: string | null;
  suggestions: SessionSuggestion[];
}) {
  const [days, setDays] = useState<number[]>(() => [parisNow().isoWeekday]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (suggestions.length === 0 && !painNote) return null;

  function assign(sessionId: string) {
    setError(null);
    start(async () => {
      const result = await assignSession(sessionId, [playerId], days);
      if (!result.ok) setError(result.error);
      else setDone((cur) => new Set(cur).add(sessionId));
    });
  }

  return (
    <Card>
      <CardTitle>
        Suggérées pour {firstName}
        {position ? <span className="ml-2 text-[13px] text-navy-400">· {position}</span> : null}
      </CardTitle>
      {painNote && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] font-semibold text-danger">
          <HeartPulse size={15} className="mt-0.5 shrink-0" aria-hidden />
          {painNote}
        </p>
      )}
      {!position && (
        <p className="mb-3 text-[12.5px] text-navy-400">
          Poste non renseigné : les suggestions ne tiennent pas compte du poste.
        </p>
      )}

      <div className="mb-3 rounded-xl bg-cream p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-navy-400">Jours</p>
        <WeekdayPicker value={days} onChange={setDays} disabled={pending} />
      </div>

      {error && <p className="mb-2 text-[12.5px] font-semibold text-danger">{error}</p>}

      <ul className="space-y-2">
        {suggestions.map((s) => {
          const isDone = done.has(s.sessionId);
          return (
            <li
              key={s.sessionId}
              className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-inset ring-sand"
              style={{ boxShadow: `inset 4px 0 0 0 ${POLE_COLORS[s.pole].hex}` }}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[13.5px] font-bold text-navy-900">
                  {s.name}
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide"
                    style={{ color: POLE_COLORS[s.pole].hex, backgroundColor: POLE_COLORS[s.pole].soft }}
                  >
                    {POLE_COLORS[s.pole].label}
                  </span>
                  <span className="text-[11px] font-semibold text-navy-400">{s.durationMinutes} min</span>
                  {s.forPain && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger">
                      <HeartPulse size={12} aria-hidden /> Douleur {ZONE_LABELS[s.forPain]}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 pl-1 text-[12.5px] leading-snug text-navy-500">{s.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => assign(s.sessionId)}
                disabled={pending || isDone || days.length === 0}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors disabled:cursor-default ${
                  isDone
                    ? "bg-success-soft text-success"
                    : "bg-navy-800 text-white hover:bg-navy-700 disabled:opacity-40"
                }`}
              >
                {isDone ? (
                  <span className="inline-flex items-center gap-1">
                    <Check size={13} aria-hidden /> Affectée
                  </span>
                ) : (
                  "Affecter"
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {suggestions.length > 0 && days.length > 0 && (
        <p className="mt-2 text-[12px] text-navy-400">Affectée {weekdaysLabel(days)}.</p>
      )}
    </Card>
  );
}
