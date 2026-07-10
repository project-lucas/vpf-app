"use client";

import { useState } from "react";
import Link from "next/link";
import { dayCompleteFeedback, perfectWeekFeedback } from "@/lib/feedback";
import { eventLabel, WEEKDAY_LABELS, WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { addDays, formatTime, parisNow, timeToMinutes } from "@/lib/dates";
import { Confetti } from "@/components/Confetti";
import { CheckIcon, FlameIcon, TrophyIcon } from "@/components/icons";
import { Overline, Rule, Quote, StarLine } from "@/components/editorial/primitives";
import { EdButton } from "@/components/editorial/forms";
import { DayActionList } from "./DayActionList";
import { DisciplineCalendar, type DayOutcome } from "./DisciplineCalendar";
import { EventCheckRow } from "./EventCheckRow";
import { PlanningEditor } from "./PlanningEditor";
import type { CompletionStatus, EventCompletion, PlannedEvent } from "@/lib/types";

// Messages de « journée bouclée » : on en montre un différent selon le jour de
// la semaine pour que la récompense ne se répète pas à l'identique.
const DAY_DONE_MESSAGES = [
  "Tous tes événements du jour sont faits. C'est comme ça qu'on progresse.",
  "Journée solide — les pros se construisent jour après jour.",
  "Rien lâché aujourd'hui. Continue, ça finit toujours par payer.",
  "Discipline au top. Ta série tient, garde le rythme.",
  "Encore une journée dans la poche. Tu prends de l'avance.",
];

interface Props {
  playerId: string;
  events: PlannedEvent[];
  completions: EventCompletion[];
  /** historique complet des journées pointées (calendrier de discipline) */
  dayHistory: Record<string, DayOutcome>;
  today: string;
  weekStart: string;
  todayWeekday: number;
  nowMinutes: number;
  /** Focus de la semaine : consigne du coach, sinon axe du bilan du joueur */
  focus: { text: string; source: "coach" | "player" } | null;
  /** série atteinte en bouclant aujourd'hui (série jusqu'à hier + 1) */
  streakOnComplete: number;
}

export function PlanningView({
  playerId,
  events,
  completions,
  dayHistory,
  today,
  weekStart,
  todayWeekday,
  nowMinutes,
  focus,
  streakOnComplete,
}: Props) {
  const [selectedDay, setSelectedDay] = useState(todayWeekday);
  const [editMode, setEditMode] = useState(false);
  const [celebrate, setCelebrate] = useState<"day" | "week" | null>(null);

  const todayEvents = events.filter((e) => e.weekday === todayWeekday);
  const statusOf = (eventId: string): CompletionStatus | undefined =>
    completions.find((c) => c.planned_event_id === eventId)?.status;
  const doneToday = todayEvents.filter((e) => statusOf(e.id) === "done").length;

  // État de chaque jour de la semaine : checkpoint + navigation en un seul
  // composant. Complet = tout validé, partiel = fraction affichée.
  const dayStates = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const date = addDays(weekStart, i);
    // un événement ajouté en cours de semaine ne compte pas pour les jours
    // passés où il n'existait pas encore (cohérent avec la clôture du cron)
    const dayEvts = events.filter(
      (e) =>
        e.weekday === day &&
        (date >= today || !e.created_at || parisNow(new Date(e.created_at)).date <= date)
    );
    const done = dayEvts.filter((e) => statusOf(e.id) === "done").length;
    const complete = dayEvts.length > 0 && done === dayEvts.length;
    return { day, total: dayEvts.length, done, complete };
  });
  const plannedDays = dayStates.filter((d) => d.total > 0);
  const weekPerfect = plannedDays.length > 0 && plannedDays.every((d) => d.complete);

  // prochain événement du jour pas encore passé
  const nextEvent = todayEvents
    .filter((e) => timeToMinutes(e.event_time) >= nowMinutes && statusOf(e.id) !== "done")
    .sort((a, b) => a.event_time.localeCompare(b.event_time))[0];

  // déclenchée quand un pointage "fait" complète la journée — et peut-être la
  // semaine. `dayComplete` est calculé par DayActionList sur l'état optimiste ;
  // les autres jours (qui ne bougent pas là) restent fiables via les props.
  function handleChecked(eventId: string, status: CompletionStatus, dayComplete: boolean) {
    if (status !== "done" || !dayComplete) return;
    const weekComplete = events
      .filter((e) => e.weekday !== todayWeekday)
      .every((e) => statusOf(e.id) === "done");
    if (weekComplete) {
      perfectWeekFeedback();
      setCelebrate("week");
    } else {
      dayCompleteFeedback();
      setCelebrate("day");
    }
  }

  if (editMode) {
    return (
      <div>
        <div className="mb-5 flex items-center justify-between">
          <Overline>Ma semaine type</Overline>
          <EdButton variant="ghost" className="!px-4 !py-2 !text-sm" onClick={() => setEditMode(false)}>
            Terminé
          </EdButton>
        </div>
        <PlanningEditor playerId={playerId} events={events} />
      </div>
    );
  }

  const dayEvents = events.filter((e) => e.weekday === selectedDay);

  const completionFor = (list: EventCompletion[], eventId: string) =>
    list.find((c) => c.planned_event_id === eventId);

  return (
    <div>
      {/* Grille des 7 jours : checkpoint + navigation. Validé = case encre + coche,
          aujourd'hui = case orange + flamme. */}
      {(events.length > 0 || plannedDays.length > 0) && (
        <div className="mt-6">
          {/* En-tête frise : lien Trophées + filet + calendrier d'historique */}
          <div className="mb-3 flex items-center gap-3">
            <Link
              href="/dashboard?section=records"
              className="ed-overline flex items-center gap-1.5 transition-colors hover:brightness-90"
            >
              <TrophyIcon size={13} /> Trophées
            </Link>
            <span aria-hidden className="h-px flex-1 bg-ink/25" />
            <DisciplineCalendar history={dayHistory} today={today} />
          </div>

          {/* Bande des cases : reliées par une chaîne, balayée par un halo ambré */}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-1 top-1/2 z-0 h-[3px] -translate-y-1/2 bg-ink/15"
            />
            <div
              aria-hidden
              className="animate-week-wave pointer-events-none absolute top-1/2 z-0 h-9 w-9 -translate-y-1/2 rounded-full bg-warm/60 blur-lg"
            />
            <div className="relative z-10 grid grid-cols-7 gap-1.5">
              {dayStates.map((d, i) => {
                const isToday = d.day === todayWeekday;
                const isSelected = d.day === selectedDay;
                const isFuture = d.day > todayWeekday;
                const partial = d.total > 0 && d.done > 0 && !d.complete;
                const missed = !isFuture && !isToday && d.total > 0 && d.done === 0;
                const letter = WEEKDAY_LABELS_SHORT[i][0];

                // % d'accomplissement du jour (journée parfaite = 100% → coche)
                const pct = d.total > 0 ? Math.round((d.done / d.total) * 100) : null;

                // validé = navy + coche ambre ; aujourd'hui = rouge ; entamé = encre
                let box = "border-2 border-hair bg-paper text-muted";
                if (d.complete) box = "border-2 border-ink bg-ink text-[#F7A93B]";
                else if (isToday) box = "border-2 border-orange bg-orange text-paper";
                else if (partial) box = "border-2 border-ink bg-paper text-ink";
                else if (missed) box = "border-2 border-hair bg-paper text-muted";

                return (
                  <button
                    key={d.day}
                    onClick={() => setSelectedDay(d.day)}
                    aria-label={`${WEEKDAY_LABELS[i]} — ${
                      pct !== null ? `${pct} % fait` : "repos"
                    }`}
                    className={`flex aspect-square w-full items-center justify-center rounded-md ${box} ${
                      isSelected ? "outline outline-2 outline-offset-2 outline-orange" : ""
                    }`}
                  >
                    {d.complete ? (
                      // journée parfaite : la coche (plus gratifiante que « 100 % »),
                      // rebond périodique décalé jour par jour → vague le long de la chaîne
                      <span
                        className="animate-check-pop inline-flex"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      >
                        <CheckIcon size={23} strokeWidth={2.6} />
                      </span>
                    ) : pct !== null && !isFuture ? (
                      // aujourd'hui (en cours) ou jour passé : % d'accomplissement
                      <span className="ed-value text-[11px]">{pct}%</span>
                    ) : (
                      <span className="ed-meta text-[10px]">{d.total === 0 ? "·" : letter}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Étiquettes des jours, alignées sous les cases */}
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {dayStates.map((d, i) => (
              <span
                key={d.day}
                className={`ed-meta text-center text-[9px] ${
                  d.day === selectedDay ? "text-ink" : "text-muted"
                }`}
              >
                {WEEKDAY_LABELS_SHORT[i]}
              </span>
            ))}
          </div>

          {weekPerfect ? (
            <StarLine className="mt-4 text-[11px]">Semaine parfaite — tout est validé</StarLine>
          ) : (
            <p className="ed-meta mt-4 text-center text-[11px] leading-relaxed text-meta">
              {todayEvents.length > 0 && doneToday === todayEvents.length ? (
                <span className="text-orange">Checkpoint du jour validé — belle lancée.</span>
              ) : nextEvent ? (
                <>
                  Aujourd&apos;hui {doneToday}/{todayEvents.length} · prochain{" "}
                  <span className="text-ink">{eventLabel(nextEvent)}</span> à{" "}
                  {formatTime(nextEvent.event_time)}
                </>
              ) : todayEvents.length > 0 ? (
                "Plus rien de prévu — pointe ta journée."
              ) : (
                "Rien de prévu aujourd'hui."
              )}
            </p>
          )}
        </div>
      )}

      {/* Focus de la semaine : consigne coach ou axe du bilan joueur */}
      {focus && (
        <div className="mt-6 rounded-md border-2 border-ink bg-card p-4">
          <Overline>Ton focus cette semaine</Overline>
          <Quote className="mt-2 text-lg">{focus.text}</Quote>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="ed-meta text-[10px] text-meta">
              {focus.source === "coach" ? "Défini par ton coach" : "Issu de ton dernier bilan"}
            </span>
            {focus.source === "player" && (
              <Link
                href="/dashboard?section=historique"
                className="ed-meta flex items-center gap-1 text-[10px] text-orange underline-offset-2 hover:underline"
              >
                Ajuster ›
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Célébration : journée bouclée, ou semaine parfaite (encore mieux) */}
      {celebrate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-8"
          onClick={() => setCelebrate(null)}
        >
          <Confetti count={celebrate === "week" ? 120 : 60} />
          <div
            className="animate-pop w-full max-w-sm overflow-hidden rounded-lg border-2 border-ink bg-paper text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bandeau navy : médaillon qui vacille + halo ambré pulsant */}
            <div className="bg-ink px-8 pb-6 pt-8">
              <span className="animate-streak-glow mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-warm/50 bg-ink text-orange">
                {celebrate === "week" ? (
                  <TrophyIcon size={40} className="animate-flame-pulse" />
                ) : (
                  <CheckIcon size={44} className="animate-flame-pulse" />
                )}
              </span>
              <p className="ed-overline mt-4 text-warm">
                {celebrate === "week" ? "Semaine · 100 %" : "Checkpoint validé"}
              </p>
            </div>

            {/* Corps crème : titre + série (le héros) + score + message du jour */}
            <div className="px-8 pb-8 pt-6">
              <p className="ed-display text-[30px] text-ink">
                {celebrate === "week" ? "Semaine parfaite" : "Journée bouclée"}
              </p>

              {/* Série atteinte : flamme + gros chiffre, la récompense qui motive */}
              <div className="mt-4 flex items-center justify-center gap-2.5">
                <FlameIcon size={26} className="animate-flame-pulse text-orange" />
                <span className="ed-value text-[40px] leading-none text-orange">
                  {streakOnComplete}
                </span>
                <span className="ed-display text-left text-[15px] leading-[0.9] text-ink">
                  {streakOnComplete > 1 ? "Jours" : "Jour"}
                  <br />
                  de suite
                </span>
              </div>

              <p className="ed-meta mt-3 text-[10px] text-meta">
                {celebrate === "week"
                  ? "Semaine complète — 100 % validé"
                  : `${todayEvents.length}/${todayEvents.length} tâches validées aujourd'hui`}
              </p>

              <p className="ed-meta mt-2 text-[11px] leading-relaxed text-meta">
                {celebrate === "week"
                  ? "Tous tes checkpoints validés. C'est ça, la régularité d'un pro."
                  : DAY_DONE_MESSAGES[(todayWeekday - 1) % DAY_DONE_MESSAGES.length]}
              </p>

              <EdButton onClick={() => setCelebrate(null)} full className="mt-6">
                Continuer
              </EdButton>
            </div>
          </div>
        </div>
      )}

      <Rule thin className="my-5" />

      <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="ed-display text-[22px] text-ink">
              {WEEKDAY_LABELS[selectedDay - 1]}
              {selectedDay === todayWeekday && (
                <span className="text-orange"> · aujourd&apos;hui</span>
              )}
              {selectedDay < todayWeekday && <span className="text-meta"> · rattrapage</span>}
            </p>
            <button
              onClick={() => setEditMode(true)}
              className="ed-meta shrink-0 text-[10px] text-meta underline-offset-2 hover:text-ink hover:underline"
            >
              Modifier ma semaine
            </button>
          </div>

          {events.length === 0 ? (
            <div className="border-2 border-hair px-5 py-10 text-center">
              <p className="ed-display text-[24px] text-ink">Planning vide</p>
              <p className="ed-meta mt-2 text-[10px] leading-relaxed text-meta">
                Les pros ont une routine. Pose tes entraînements, ta prépa et tes habitudes.
              </p>
              <EdButton onClick={() => setEditMode(true)} className="mt-5 !px-4 !py-2.5 !text-sm">
                Construire ma semaine
              </EdButton>
            </div>
          ) : selectedDay === todayWeekday ? (
            /* Aujourd'hui : les tâches du planning, À faire / Fait */
            <DayActionList
              events={dayEvents}
              completions={completions}
              weekStart={weekStart}
              onEventChecked={handleChecked}
            />
          ) : dayEvents.length === 0 ? (
            <p className="ed-meta py-6 text-center text-[10px] text-muted">
              Rien de prévu ce jour-là.
            </p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <EventCheckRow
                  key={event.id}
                  event={event}
                  completion={completionFor(completions, event.id)}
                  weekStart={weekStart}
                  canCheck={selectedDay <= todayWeekday}
                />
              ))}
            </div>
          )}

          {selectedDay > todayWeekday && dayEvents.length > 0 && (
            <p className="ed-meta mt-3 text-center text-[10px] text-muted">
              Tu pourras pointer ces événements le jour venu.
            </p>
          )}

          {selectedDay < todayWeekday && dayEvents.length > 0 && (
            <p className="ed-meta mt-3 text-center text-[10px] text-meta">
              Jour passé — tu peux encore valider ce que tu as fait.
            </p>
          )}
      </>
    </div>
  );
}
