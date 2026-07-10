import Link from "next/link";
import { ClipboardList, NotebookPen } from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import {
  addDays,
  currentWeekStart,
  formatWeekFr,
  parisNow,
  weekStartOf,
} from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeftIcon } from "@/components/icons";
import { DayView, type DayViewEntry } from "./DayView";
import type { EventCompletion, MatchStat, PlannedEvent } from "@/lib/types";

export const metadata = { title: "Planning coach — VPF" };
export const dynamic = "force-dynamic";

type DayEntry = DayViewEntry;

export default async function CoachPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; j?: string }>;
}) {
  const { w, j } = await searchParams;
  const thisWeek = currentWeekStart();
  // Semaine affichée : paramètre ?w= (ramené au lundi), sinon semaine courante
  const weekStart =
    w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStartOf(w) : thisWeek;
  const isCurrentWeek = weekStart === thisWeek;
  const { date: today, isoWeekday: todayWeekday } = parisNow();

  const supabase = await createClient();
  const user = await getCachedUser();
  // filtre coach_id explicite : un admin ne voit ici QUE ses propres joueurs
  const players = await getPlayersWithDiscipline(supabase, user?.id);
  // Filtre par joueur : ?j=<id>, ignoré s'il ne correspond à aucun joueur actif
  const selectedPlayer = players.find((p) => p.id === j)?.id ?? null;
  const ids = players.map((p) => p.id);
  const nameOf = new Map(players.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  const [{ data: events }, { data: completions }, { data: sheets }, { data: reviews }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase.from("planned_events").select("*").in("player_id", ids),
          supabase
            .from("event_completions")
            .select("*")
            .eq("week_start", weekStart)
            .in("player_id", ids),
          supabase
            .from("match_stats")
            .select("id, player_id, points, match_date")
            .gte("match_date", weekStart)
            .lte("match_date", addDays(weekStart, 6))
            .in("player_id", ids),
          supabase
            .from("weekly_reviews")
            .select("id, player_id")
            .eq("week_start", weekStart)
            .in("player_id", ids),
        ]);

  const weekCompletions = (completions ?? []) as EventCompletion[];
  const plannedEvents = (events ?? []) as PlannedEvent[];

  // Entrées jour par jour : pointages enregistrés + événements de la semaine
  // type pas encore pointés (semaine courante ou future uniquement — pour les
  // semaines passées, les pointages clôturés font foi).
  const byDay: DayEntry[][] = Array.from({ length: 7 }, () => []);

  for (const c of weekCompletions) {
    byDay[c.weekday - 1].push({
      key: `c-${c.id}`,
      playerId: c.player_id,
      playerName: nameOf.get(c.player_id) ?? "",
      eventType: c.event_type,
      customName: c.custom_name ?? "",
      customIcon: c.custom_icon ?? "",
      customColor: c.custom_color ?? "",
      time: c.event_time,
      duration: c.duration_minutes,
      status: c.status === "done" ? "done" : "not_done",
      comment: c.comment,
    });
  }

  if (weekStart >= thisWeek) {
    const pointed = new Set(weekCompletions.map((c) => c.planned_event_id).filter(Boolean));
    for (const e of plannedEvents) {
      if (pointed.has(e.id)) continue;
      byDay[e.weekday - 1].push({
        key: `e-${e.id}`,
        playerId: e.player_id,
        playerName: nameOf.get(e.player_id) ?? "",
        eventType: e.event_type,
        customName: e.custom_name ?? "",
        customIcon: e.custom_icon ?? "",
        customColor: e.custom_color ?? "",
        time: e.event_time,
        duration: e.duration_minutes,
        status: isCurrentWeek && e.weekday < todayWeekday ? "missed" : "pending",
        comment: "",
      });
    }
  }

  for (const day of byDay) {
    day.sort((a, b) => (a.time === b.time ? a.playerName.localeCompare(b.playerName, "fr") : a.time < b.time ? -1 : 1));
  }

  // Vue filtrée sur un joueur : le détail jour par jour et les compteurs suivent
  const shownByDay = selectedPlayer
    ? byDay.map((d) => d.filter((e) => e.playerId === selectedPlayer))
    : byDay;

  const totalEntries = shownByDay.reduce((s, d) => s + d.length, 0);
  const doneCount = shownByDay.flat().filter((e) => e.status === "done").length;

  // Suivi par joueur : pointages, feuille de match et bilan de la semaine affichée
  const sheetByPlayer = new Map(
    ((sheets ?? []) as Pick<MatchStat, "id" | "player_id" | "points" | "match_date">[]).map(
      (s) => [s.player_id, s]
    )
  );
  const reviewedPlayers = new Set((reviews ?? []).map((r) => r.player_id));

  const weekHref = (week: string) =>
    `/coach/planning?w=${week}${selectedPlayer ? `&j=${selectedPlayer}` : ""}`;
  const prevHref = weekHref(addDays(weekStart, -7));
  const nextHref = weekHref(addDays(weekStart, 7));

  return (
    <>
      <PageHeader title="Planning" subtitle="La semaine de tous tes joueurs." />

      {/* Navigation de semaine */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-navy-100 bg-white px-2 py-2 shadow-sm">
        <Link
          href={prevHref}
          aria-label="Semaine précédente"
          className="rounded-xl p-1.5 text-navy-500 hover:bg-navy-50"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold text-navy-800">Semaine {formatWeekFr(weekStart)}</p>
          {isCurrentWeek && (
            <Badge tone="navy" className="mt-0.5">
              En cours
            </Badge>
          )}
        </div>
        <Link
          href={nextHref}
          aria-label="Semaine suivante"
          className="rounded-xl p-1.5 text-navy-500 hover:bg-navy-50"
        >
          <ChevronLeftIcon size={18} className="rotate-180" />
        </Link>
      </div>

      {!isCurrentWeek && (
        <Link
          href={weekHref(thisWeek)}
          className="mb-4 block rounded-xl border border-navy-200 bg-white py-2 text-center text-xs font-bold text-navy-600 hover:bg-navy-50"
        >
          ↩ Revenir à la semaine en cours
        </Link>
      )}

      {/* Filtre par joueur */}
      {players.length > 1 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          <Link
            href={`/coach/planning?w=${weekStart}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              selectedPlayer === null
                ? "bg-navy-800 text-white"
                : "border border-navy-200 bg-white text-navy-500"
            }`}
          >
            Tous
          </Link>
          {players.map((p) => (
            <Link
              key={p.id}
              href={`/coach/planning?w=${weekStart}&j=${p.id}`}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                selectedPlayer === p.id
                  ? "bg-navy-800 text-white"
                  : "border border-navy-200 bg-white text-navy-500"
              }`}
            >
              {p.first_name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Événements" value={`${totalEntries}`} hint="tous joueurs confondus" />
        <StatCard
          label="Réalisés"
          value={totalEntries > 0 ? `${doneCount}/${totalEntries}` : "—"}
          hint={totalEntries > 0 ? `${Math.round((doneCount / totalEntries) * 100)} %` : undefined}
        />
      </div>

      {/* Suivi par joueur : pointages + feuille de match + bilan */}
      <Card className="mt-5">
        <CardTitle>Suivi de la semaine par joueur</CardTitle>
        {players.length === 0 ? (
          <p className="text-sm text-navy-400">Aucun joueur actif pour le moment.</p>
        ) : (
          <div className="divide-y divide-navy-50">
            {players
              .filter((p) => !selectedPlayer || p.id === selectedPlayer)
              .map((p) => {
              const entries = byDay.flat().filter((e) => e.playerId === p.id);
              const done = entries.filter((e) => e.status === "done").length;
              const sheet = sheetByPlayer.get(p.id);
              const hasReview = reviewedPlayers.has(p.id);
              return (
                <Link
                  key={p.id}
                  href={`/coach/joueurs/${p.id}`}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-navy-800">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={entries.length > 0 && done === entries.length ? "success" : "neutral"}>
                      {entries.length > 0 ? `${done}/${entries.length}` : "—"}
                    </Badge>
                    <Badge tone={sheet ? "success" : "neutral"}>
                      <ClipboardList size={11} />
                      {sheet ? `${sheet.points} pts` : "—"}
                    </Badge>
                    <Badge tone={hasReview ? "success" : "neutral"}>
                      <NotebookPen size={11} />
                      {hasReview ? "Bilan" : "—"}
                    </Badge>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* Détail par jour : barre de filtre Lun → Dim, le jour choisi est isolé.
          key = semaine+filtre pour repartir sur le bon jour quand on navigue. */}
      <DayView
        key={`${weekStart}-${selectedPlayer ?? "all"}`}
        days={shownByDay.map((entries, i) => ({
          date: addDays(weekStart, i),
          isToday: addDays(weekStart, i) === today,
          entries,
        }))}
        initialDay={isCurrentWeek ? todayWeekday : 1}
      />
    </>
  );
}
