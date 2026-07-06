import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  ageFromBirthdate,
  currentWeekStart,
  formatDateFr,
  formatTime,
  parisNow,
} from "@/lib/dates";
import { HABIT_HEATMAP_WEEKS } from "@/lib/constants";
import { HabitCard } from "@/components/habits/HabitCard";
import { MessageCircle, Star } from "lucide-react";
import { EVENT_TYPE_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { EventTypeIcon } from "@/components/planning/EventIcon";
import { formatPercent } from "@/lib/discipline";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeftIcon } from "@/components/icons";
import { PlanningEditor } from "@/components/planning/PlanningEditor";
import { PlayerProfileForm } from "./PlayerProfileForm";
import { WeekFocusForm } from "./WeekFocusForm";
import { AssignedSessionsManager } from "./AssignedSessionsManager";
import { CoachNotesPanel } from "./CoachNotesPanel";
import type {
  Checkin,
  CoachNote,
  EventCompletion,
  Habit,
  HabitWithChecks,
  LibrarySession,
  MatchStat,
  PlannedEvent,
  SessionAssignmentWithSession,
  WeeklyReview,
  WeeklySummary,
} from "@/lib/types";

export const metadata = { title: "Fiche joueur — VPF" };
export const dynamic = "force-dynamic";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const { data: playerRaw } = await supabase
    .from("players")
    .select("*, profile:profiles!players_id_fkey(first_name, last_name)")
    .eq("id", id)
    .maybeSingle();

  if (!playerRaw) notFound();
  const profile = Array.isArray(playerRaw.profile) ? playerRaw.profile[0] : playerRaw.profile;

  const [
    { data: events },
    { data: completions },
    { data: summaries },
    { data: assignments },
    { data: library },
    { data: visibleNotes },
    { data: stats },
    { data: reviews },
    { data: notes },
    { data: lastCheckin },
    { data: habits },
    { data: habitChecks },
    { data: weekFocus },
  ] = await Promise.all([
    supabase
      .from("planned_events")
      .select("*")
      .eq("player_id", id)
      .order("weekday")
      .order("event_time"),
    supabase
      .from("event_completions")
      .select("*")
      .eq("player_id", id)
      .eq("week_start", weekStart)
      .order("weekday")
      .order("event_time"),
    supabase
      .from("weekly_summaries")
      .select("*")
      .eq("player_id", id)
      .order("week_start", { ascending: false })
      .limit(8),
    supabase
      .from("session_assignments")
      .select("*, session:library_sessions(*), completion:session_completions(*)")
      .eq("player_id", id)
      .order("order_index"),
    supabase.from("library_sessions").select("*").order("name"),
    supabase.from("visible_notes").select("pole, content").eq("player_id", id),
    supabase
      .from("match_stats")
      .select("*")
      .eq("player_id", id)
      .order("match_date", { ascending: false }),
    supabase
      .from("weekly_reviews")
      .select("*")
      .eq("player_id", id)
      .order("week_start", { ascending: false }),
    supabase
      .from("coach_notes")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("checkins")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("habits").select("*").eq("player_id", id).order("position"),
    supabase
      .from("habit_checks")
      .select("habit_id, check_date")
      .eq("player_id", id)
      .gte("check_date", addDays(parisNow().date, -7 * HABIT_HEATMAP_WEEKS)),
    supabase.from("coach_focus").select("content").eq("player_id", id).maybeSingle(),
  ]);

  const today = parisNow().date;
  const habitsWithChecks: HabitWithChecks[] = ((habits ?? []) as Habit[]).map((h) => ({
    ...h,
    checkDates: (habitChecks ?? []).filter((c) => c.habit_id === h.id).map((c) => c.check_date),
  }));

  const allAssignments: SessionAssignmentWithSession[] = (assignments ?? [])
    .map((a) => ({
      ...a,
      session: Array.isArray(a.session) ? a.session[0] : a.session,
      completion: Array.isArray(a.completion) ? (a.completion[0] ?? null) : a.completion,
    }))
    .filter((a) => a.session);

  const matchStats = (stats ?? []) as MatchStat[];
  const avgPoints =
    matchStats.length > 0
      ? matchStats.reduce((s, m) => s + m.points, 0) / matchStats.length
      : null;
  const checkin = lastCheckin as Checkin | null;
  const age = ageFromBirthdate(playerRaw.birthdate);

  const weekCompletions = (completions ?? []) as EventCompletion[];
  const weekEvents = (events ?? []) as PlannedEvent[];

  // ---- Assiduité de la semaine : jauge globale + détail jour par jour ----
  const weekDone = weekCompletions.filter((c) => c.status === "done").length;
  const todayWeekday = parisNow().isoWeekday;
  const dayBreakdown = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    return {
      day,
      planned: weekEvents.filter((e) => e.weekday === day).length,
      done: weekCompletions.filter((c) => c.weekday === day && c.status === "done").length,
    };
  });

  return (
    <>
      <Link
        href="/coach/joueurs"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-400"
      >
        <ChevronLeftIcon size={16} /> Mes joueurs
      </Link>

      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-navy-900">
          {profile?.first_name} {profile?.last_name}
        </h1>
        <p className="mt-0.5 text-sm text-navy-400">
          {[playerRaw.position, playerRaw.club, age !== null ? `${age} ans` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {checkin && (
          <div className="mt-2">
            <Badge tone={checkin.question === "pain" && checkin.score >= 5 ? "warning" : "neutral"}>
              Dernier check-in : {checkin.question === "energy" ? "énergie" : "douleurs"}{" "}
              {checkin.score}/10 · {formatDateFr(checkin.created_at.slice(0, 10))}
            </Badge>
          </div>
        )}
      </div>

      <Tabs
        items={[
          {
            label: "Profil",
            content: (
              <PlayerProfileForm
                playerId={id}
                initial={{
                  first_name: profile?.first_name ?? "",
                  last_name: profile?.last_name ?? "",
                  position: playerRaw.position,
                  club: playerRaw.club,
                  birthdate: playerRaw.birthdate,
                  height_cm: playerRaw.height_cm,
                  weight_kg: playerRaw.weight_kg,
                  season_goal: playerRaw.season_goal,
                }}
              />
            ),
          },
          {
            label: "Planning",
            content: (
              <div className="space-y-5">
                <Card>
                  <CardTitle>Focus de la semaine</CardTitle>
                  <WeekFocusForm playerId={id} initialContent={weekFocus?.content ?? ""} />
                </Card>

                <Card>
                  <CardTitle>Semaine en cours</CardTitle>

                  {/* Assiduité : jauge hebdo + détail jour par jour */}
                  {weekEvents.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-navy-500">
                          Assiduité de la semaine
                        </span>
                        <span className="text-sm font-extrabold text-navy-800">
                          {Math.min(weekDone, weekEvents.length)}/{weekEvents.length} ·{" "}
                          {formatPercent(Math.min(1, weekDone / weekEvents.length))}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-50">
                        <div
                          className={`h-full rounded-full transition-all ${
                            weekDone >= weekEvents.length
                              ? "bg-gold"
                              : weekDone / weekEvents.length < 0.6
                                ? "bg-danger/70"
                                : "bg-navy-700"
                          }`}
                          style={{ width: `${Math.min(1, weekDone / weekEvents.length) * 100}%` }}
                        />
                      </div>
                      <div className="mt-2.5 grid grid-cols-7 gap-1">
                        {dayBreakdown.map((d) => (
                          <div key={d.day} className="text-center">
                            <p
                              className={`text-[9px] font-bold ${
                                d.day === todayWeekday ? "text-navy-800" : "text-navy-300"
                              }`}
                            >
                              {WEEKDAY_LABELS[d.day - 1].slice(0, 3)}
                            </p>
                            <p
                              className={`mt-0.5 rounded-md py-0.5 text-[10px] font-bold ${
                                d.planned === 0
                                  ? "bg-navy-50 text-navy-200"
                                  : d.done >= d.planned
                                    ? "bg-success-soft text-success"
                                    : d.day < todayWeekday
                                      ? "bg-danger-soft text-danger"
                                      : "bg-navy-50 text-navy-500"
                              }`}
                            >
                              {d.planned === 0 ? "—" : `${d.done}/${d.planned}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {weekCompletions.length === 0 ? (
                    <p className="text-sm text-navy-400">Aucun pointage cette semaine.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {weekCompletions.map((c) => (
                        <div key={c.id} className="rounded-xl bg-navy-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-navy-800">
                              <EventTypeIcon
                                type={c.event_type}
                                size={13}
                                className="-mt-0.5 mr-1 inline"
                                colored
                              />
                              {EVENT_TYPE_LABELS[c.event_type]}
                              <span className="ml-1.5 text-xs font-medium text-navy-400">
                                {WEEKDAY_LABELS[c.weekday - 1]} {formatTime(c.event_time)}
                              </span>
                            </span>
                            <Badge tone={c.status === "done" ? "success" : "danger"}>
                              {c.status === "done" ? "Fait" : "Pas fait"}
                            </Badge>
                          </div>
                          {c.comment && (
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-navy-500">
                              <MessageCircle size={13} className="mt-0.5 shrink-0" />
                              <span className="min-w-0">{c.comment}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {(summaries ?? []).length > 0 && (
                  <Card>
                    <CardTitle>Historique des semaines</CardTitle>
                    <div className="divide-y divide-navy-50">
                      {((summaries ?? []) as WeeklySummary[]).map((s) => (
                        <div key={s.id} className="flex items-center justify-between py-2">
                          <span className="text-sm text-navy-500">
                            Semaine du {formatDateFr(s.week_start)}
                          </span>
                          <span className="text-sm font-bold text-navy-800">
                            {s.done_count}/{s.planned_count} ·{" "}
                            {formatPercent(s.planned_count > 0 ? s.done_count / s.planned_count : null)}
                            {s.planned_count > 0 && s.done_count >= s.planned_count && (
                              <Star size={12} className="-mt-0.5 ml-1 inline text-gold" />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy-500">
                    Semaine type du joueur
                  </h3>
                  <PlanningEditor playerId={id} events={(events ?? []) as PlannedEvent[]} />
                </div>
              </div>
            ),
          },
          {
            label: "Technique",
            content: (
              <AssignedSessionsManager
                playerId={id}
                pole="basket"
                assignments={allAssignments.filter((a) => a.session.pole === "basket")}
                library={((library ?? []) as LibrarySession[]).filter((s) => s.pole === "basket")}
                visibleNote={
                  (visibleNotes ?? []).find((n) => n.pole === "basket")?.content ?? ""
                }
              />
            ),
          },
          {
            label: "Physique",
            content: (
              <AssignedSessionsManager
                playerId={id}
                pole="physique"
                assignments={allAssignments.filter((a) => a.session.pole === "physique")}
                library={((library ?? []) as LibrarySession[]).filter((s) => s.pole === "physique")}
                visibleNote={
                  (visibleNotes ?? []).find((n) => n.pole === "physique")?.content ?? ""
                }
              />
            ),
          },
          {
            label: "Stats",
            content: (
              <Card>
                <CardTitle>
                  Statistiques match
                  {avgPoints !== null && ` — ${avgPoints.toFixed(1)} pts/match`}
                </CardTitle>
                {matchStats.length === 0 ? (
                  <p className="text-sm text-navy-400">Aucun match saisi par le joueur.</p>
                ) : (
                  <div className="divide-y divide-navy-50">
                    {matchStats.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-navy-800">
                            {formatDateFr(s.match_date)}
                          </p>
                          <p className="text-xs text-navy-400">
                            {s.minutes} min · {s.is_starter ? "titulaire" : "remplaçant"} ·{" "}
                            {s.threes_made} × 3 pts · {s.free_throws_made} LF
                          </p>
                        </div>
                        <p className="text-lg font-extrabold text-navy-800">
                          {s.points}{" "}
                          <span className="text-xs font-semibold text-navy-400">pts</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ),
          },
          {
            label: "Bilans",
            content: (
              <div className="space-y-3">
                {(reviews ?? []).length === 0 ? (
                  <Card>
                    <p className="text-sm text-navy-400">Aucun bilan hebdomadaire pour le moment.</p>
                  </Card>
                ) : (
                  ((reviews ?? []) as WeeklyReview[]).map((r) => (
                    <Card key={r.id}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-400">
                        Semaine du {formatDateFr(r.week_start)}
                      </p>
                      <p className="text-sm text-navy-800">
                        <span className="font-semibold text-success">Bien fait : </span>
                        {r.went_well || "—"}
                      </p>
                      <p className="mt-2 text-sm text-navy-800">
                        <span className="font-semibold text-warning">À améliorer : </span>
                        {r.to_improve || "—"}
                      </p>
                    </Card>
                  ))
                )}
              </div>
            ),
          },
          {
            label: "Habitudes",
            content: (
              <div className="space-y-3">
                {habitsWithChecks.length === 0 ? (
                  <Card>
                    <p className="text-sm text-navy-400">
                      Ce joueur n&apos;a pas encore créé d&apos;habitudes.
                    </p>
                  </Card>
                ) : (
                  habitsWithChecks.map((h) => (
                    <HabitCard key={h.id} habit={h} today={today} readOnly />
                  ))
                )}
              </div>
            ),
          },
          {
            label: "Notes privées",
            content: <CoachNotesPanel playerId={id} notes={(notes ?? []) as CoachNote[]} />,
          },
        ]}
      />
    </>
  );
}
