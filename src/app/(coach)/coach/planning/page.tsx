import Link from "next/link";
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
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeftIcon } from "@/components/icons";
import { DayView, type DayViewEntry } from "./DayView";
import { PlayerFilter } from "./PlayerFilter";
import type { EventCompletion, PlannedEvent } from "@/lib/types";

export const metadata = { title: "Planning coach — VPF" };
export const dynamic = "force-dynamic";

type DayEntry = DayViewEntry;

/**
 * Le planning de la semaine, jour par jour. Le suivi par joueur (pointages,
 * feuille, bilan) a rejoint la vue « Semaine » de la liste des joueurs — ici,
 * il ne reste que ce qu'aucun autre écran ne montre : le détail par jour.
 */
export default async function CoachPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; j?: string }>;
}) {
  const { w, j } = await searchParams;
  const thisWeek = currentWeekStart();
  // Semaine affichée : paramètre ?w= (ramené au lundi), sinon semaine courante
  const weekStart = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStartOf(w) : thisWeek;
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

  const [{ data: events }, { data: completions }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
          supabase.from("planned_events").select("*").in("player_id", ids),
          supabase
            .from("event_completions")
            .select("*")
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
    day.sort((a, b) =>
      a.time === b.time ? a.playerName.localeCompare(b.playerName, "fr") : a.time < b.time ? -1 : 1
    );
  }

  // Vue filtrée sur un joueur : le détail jour par jour et les compteurs suivent
  const shownByDay = selectedPlayer
    ? byDay.map((d) => d.filter((e) => e.playerId === selectedPlayer))
    : byDay;

  const totalEntries = shownByDay.reduce((s, d) => s + d.length, 0);
  const doneCount = shownByDay.flat().filter((e) => e.status === "done").length;

  const weekHref = (week: string) =>
    `/coach/planning?w=${week}${selectedPlayer ? `&j=${selectedPlayer}` : ""}`;
  const prevHref = weekHref(addDays(weekStart, -7));
  const nextHref = weekHref(addDays(weekStart, 7));

  return (
    <>
      <PageHeader title="Planning" subtitle="La semaine de tes joueurs, jour par jour." />

      {/* Navigation de semaine */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-navy-100 bg-white px-2 py-1.5">
        <Link
          href={prevHref}
          aria-label="Semaine précédente"
          className="rounded-xl p-1.5 text-navy-500 hover:bg-navy-50"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <div className="flex items-center gap-2 text-center">
          <p className="text-sm font-bold text-navy-800">Semaine {formatWeekFr(weekStart)}</p>
          {isCurrentWeek ? (
            <Badge tone="navy">En cours</Badge>
          ) : (
            <Link href={weekHref(thisWeek)} className="text-[11px] font-bold text-navy-500 underline">
              Revenir à aujourd&apos;hui
            </Link>
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

      {players.length > 1 && (
        <div className="mb-3">
          <PlayerFilter
            players={players.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }))}
            selected={selectedPlayer}
            weekStart={weekStart}
          />
        </div>
      )}

      <StatStrip
        className="mb-5"
        items={[
          { label: "Événements", value: `${totalEntries}`, hint: selectedPlayer ? undefined : "tous joueurs" },
          {
            label: "Réalisés",
            value: totalEntries > 0 ? `${doneCount}/${totalEntries}` : "—",
            hint: totalEntries > 0 ? `${Math.round((doneCount / totalEntries) * 100)} %` : undefined,
          },
        ]}
      />

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
