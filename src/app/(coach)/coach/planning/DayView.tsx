"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import { eventLabel, formatDuration, WEEKDAY_LABELS, WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { formatTime } from "@/lib/dates";
import { EventTypeIcon } from "@/components/planning/EventIcon";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { EventType } from "@/lib/types";

export type EntryStatus = "done" | "not_done" | "missed" | "pending";

export interface DayViewEntry {
  key: string;
  playerId: string;
  playerName: string;
  eventType: EventType;
  customName: string;
  customIcon: string;
  customColor: string;
  time: string; // "HH:MM:SS"
  duration: number | null;
  status: EntryStatus;
  comment: string;
}

const STATUS_BADGE: Record<
  EntryStatus,
  { tone: "success" | "danger" | "warning" | "neutral"; label: string }
> = {
  done: { tone: "success", label: "Fait" },
  not_done: { tone: "danger", label: "Pas fait" },
  missed: { tone: "warning", label: "Non pointé" },
  pending: { tone: "neutral", label: "À venir" },
};

// pastille d'état : un point par activité, lisible sans déplier
const STATUS_DOT: Record<EntryStatus, string> = {
  done: "bg-success",
  not_done: "bg-danger",
  missed: "bg-warning",
  pending: "bg-navy-200",
};

export interface DayViewDay {
  /** "YYYY-MM-DD" */
  date: string;
  isToday: boolean;
  entries: DayViewEntry[];
}

/**
 * Détail de la semaine coach, un jour à la fois : barre de filtre Lun → Dim
 * (mini compteur fait/total par jour), puis le jour choisi GROUPÉ PAR JOUEUR —
 * une ligne compacte par joueur (pastilles d'état + x/y), dépliable pour le
 * détail. Pensé pour rester lisible avec 30 joueurs.
 */
export function DayView({ days, initialDay }: { days: DayViewDay[]; initialDay: number }) {
  const [selected, setSelected] = useState(Math.min(7, Math.max(1, initialDay)));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const day = days[selected - 1];
  const dayDone = day.entries.filter((e) => e.status === "done").length;

  // Regroupement par joueur (ordre alphabétique), événements triés par heure
  const byPlayer = new Map<string, { name: string; entries: DayViewEntry[] }>();
  for (const e of day.entries) {
    const group = byPlayer.get(e.playerId) ?? { name: e.playerName, entries: [] };
    group.entries.push(e);
    byPlayer.set(e.playerId, group);
  }
  const groups = [...byPlayer.entries()]
    .map(([playerId, g]) => ({ playerId, ...g }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  function toggle(playerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function selectDay(dayNum: number) {
    setSelected(dayNum);
    setExpanded(new Set()); // on repart replié : vue d'ensemble d'abord
  }

  return (
    <div className="mt-5">
      {/* Barre de filtre : un onglet par jour, compteur fait/total intégré */}
      <div className="grid grid-cols-7 gap-1 rounded-2xl border border-navy-100 bg-white p-1 shadow-sm">
        {days.map((d, i) => {
          const dayNum = i + 1;
          const active = dayNum === selected;
          const done = d.entries.filter((e) => e.status === "done").length;
          const total = d.entries.length;
          const complete = total > 0 && done === total;
          return (
            <button
              key={d.date}
              onClick={() => selectDay(dayNum)}
              aria-label={`${WEEKDAY_LABELS[i]} ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`}
              aria-pressed={active}
              className={`flex flex-col items-center rounded-xl px-0.5 py-1.5 transition-colors ${
                active ? "bg-navy-800 text-white" : "text-navy-500 hover:bg-navy-50"
              }`}
            >
              <span className="text-[10px] font-bold uppercase">
                {WEEKDAY_LABELS_SHORT[i]}
                {d.isToday && (
                  <span
                    aria-hidden
                    className={`ml-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                      active ? "bg-gold" : "bg-danger"
                    }`}
                  />
                )}
              </span>
              <span
                className={`mt-0.5 text-[10px] font-bold ${
                  total === 0
                    ? active
                      ? "text-white/40"
                      : "text-navy-200"
                    : complete
                      ? active
                        ? "text-gold"
                        : "text-success"
                      : active
                        ? "text-white/80"
                        : "text-navy-400"
                }`}
              >
                {total === 0 ? "—" : `${done}/${total}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Jour sélectionné : une ligne par joueur, dépliable */}
      <Card className="mt-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold uppercase tracking-wide text-navy-800">
            {WEEKDAY_LABELS[selected - 1]}{" "}
            <span className="text-navy-300">
              {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
            </span>
          </h2>
          <span className="flex items-center gap-1.5">
            {day.isToday && <Badge tone="navy">Aujourd&apos;hui</Badge>}
            {day.entries.length > 0 && (
              <Badge tone={dayDone === day.entries.length ? "success" : "neutral"}>
                {dayDone}/{day.entries.length} fait{dayDone > 1 ? "s" : ""}
              </Badge>
            )}
          </span>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-navy-300">Rien de planifié ce jour-là.</p>
        ) : (
          <div className="divide-y divide-navy-50">
            {groups.map((g) => {
              const done = g.entries.filter((e) => e.status === "done").length;
              const total = g.entries.length;
              const complete = done === total;
              const hasProblem = g.entries.some(
                (e) => e.status === "not_done" || e.status === "missed"
              );
              const open = expanded.has(g.playerId);
              return (
                <div key={g.playerId}>
                  {/* Ligne compacte : nom + pastilles (une par activité) + x/y */}
                  <button
                    onClick={() => toggle(g.playerId)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 py-2.5 text-left"
                  >
                    <ChevronRight
                      size={14}
                      className={`shrink-0 text-navy-300 transition-transform ${
                        open ? "rotate-90" : ""
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-800">
                      {g.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1" aria-hidden>
                      {g.entries.slice(0, 8).map((e) => (
                        <span
                          key={e.key}
                          className={`h-2 w-2 rounded-full ${STATUS_DOT[e.status]}`}
                          title={STATUS_BADGE[e.status].label}
                        />
                      ))}
                      {g.entries.length > 8 && (
                        <span className="text-[10px] text-navy-300">+{g.entries.length - 8}</span>
                      )}
                    </span>
                    <Badge
                      tone={complete ? "success" : hasProblem ? "danger" : "neutral"}
                      className="shrink-0"
                    >
                      {done}/{total}
                    </Badge>
                  </button>

                  {/* Détail du joueur : ses activités du jour + accès fiche */}
                  {open && (
                    <div className="mb-2.5 ml-6 space-y-1.5">
                      {g.entries.map((e) => {
                        const badge = STATUS_BADGE[e.status];
                        return (
                          <div key={e.key} className="rounded-xl bg-navy-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 truncate text-xs font-medium text-navy-600">
                                <EventTypeIcon
                                  type={e.eventType}
                                  event={{
                                    event_type: e.eventType,
                                    custom_name: e.customName,
                                    custom_icon: e.customIcon,
                                    custom_color: e.customColor,
                                  }}
                                  size={12}
                                  className="-mt-0.5 mr-1 inline"
                                  colored
                                />
                                {eventLabel({ event_type: e.eventType, custom_name: e.customName })}{" "}
                                · {formatTime(e.time)}
                                {e.duration ? ` · ${formatDuration(e.duration)}` : ""}
                              </p>
                              <Badge tone={badge.tone} className="shrink-0">
                                {badge.label}
                              </Badge>
                            </div>
                            {e.comment && (
                              <p className="mt-1 flex items-start gap-1.5 text-xs text-navy-500">
                                <MessageCircle size={13} className="mt-0.5 shrink-0" />
                                <span className="min-w-0">{e.comment}</span>
                              </p>
                            )}
                          </div>
                        );
                      })}
                      <Link
                        href={`/coach/joueurs/${g.playerId}`}
                        className="inline-block pt-0.5 text-xs font-bold text-navy-500 underline-offset-2 hover:underline"
                      >
                        Voir la fiche →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Légende des pastilles */}
        {groups.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-navy-50 pt-2.5 text-[10px] text-navy-400">
            {(Object.keys(STATUS_DOT) as EntryStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} aria-hidden />
                {STATUS_BADGE[s].label}
              </span>
            ))}
          </p>
        )}
      </Card>
    </div>
  );
}
