import { createClient } from "@/lib/supabase/server";
import { getParentChild } from "@/lib/parent-data";
import { currentWeekStart, formatDateFr, parisNow } from "@/lib/dates";
import { formatPercent } from "@/lib/discipline";
import { AVAILABILITY_LABELS, WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LogoutButton } from "@/components/LogoutButton";
import { Star } from "lucide-react";
import type {
  MatchStat,
  PlannedEvent,
  PlayerAvailability,
  PlayerGoal,
  WeeklySummary,
} from "@/lib/types";

export const metadata = { title: "Suivi — VPF" };
export const dynamic = "force-dynamic";

export default async function ParentHomePage() {
  const child = await getParentChild();
  if (!child) {
    return (
      <>
        <PageHeader title="Espace parent" />
        <EmptyState>
          Votre compte n&apos;est lié à aucun joueur actif. Contactez le coach pour recevoir une
          nouvelle invitation.
        </EmptyState>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const [{ data: events }, { data: completions }, { data: summaries }, { data: stats }, { data: goals }] =
    await Promise.all([
      supabase.from("planned_events").select("*").eq("player_id", child.playerId),
      supabase
        .from("event_completions")
        .select("weekday, status")
        .eq("player_id", child.playerId)
        .eq("week_start", weekStart),
      supabase
        .from("weekly_summaries")
        .select("*")
        .eq("player_id", child.playerId)
        .order("week_start", { ascending: false })
        .limit(8),
      supabase
        .from("match_stats")
        .select("*")
        .eq("player_id", child.playerId)
        .order("match_date", { ascending: false }),
      supabase
        .from("player_goals")
        .select("*")
        .eq("player_id", child.playerId)
        .order("created_at", { ascending: false }),
    ]);

  const weekEvents = (events ?? []) as PlannedEvent[];
  const weekDone = (completions ?? []).filter((c) => c.status === "done").length;
  const todayWeekday = parisNow().isoWeekday;
  const dayBreakdown = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    return {
      day,
      planned: weekEvents.filter((e) => e.weekday === day).length,
      done: (completions ?? []).filter((c) => c.weekday === day && c.status === "done").length,
    };
  });

  const matchStats = (stats ?? []) as MatchStat[];
  const avgPoints =
    matchStats.length > 0
      ? (matchStats.reduce((s, m) => s + m.points, 0) / matchStats.length).toFixed(1)
      : "—";
  const recordPoints =
    matchStats.length > 0 ? `${Math.max(...matchStats.map((m) => m.points))}` : "—";

  const availability = child.availability as PlayerAvailability;

  return (
    <>
      <PageHeader
        title={`${child.firstName} ${child.lastName}`}
        subtitle={[child.position, child.club].filter(Boolean).join(" · ") || undefined}
      />

      {availability !== "available" && (
        <div className="mb-4">
          <Badge tone="warning">
            {AVAILABILITY_LABELS[availability]} — suivi en pause, la série est gelée
          </Badge>
        </div>
      )}

      {/* Assiduité de la semaine : mêmes chiffres que le coach et le joueur */}
      <Card>
        <CardTitle>Cette semaine</CardTitle>
        {weekEvents.length === 0 ? (
          <p className="text-sm text-navy-400">Aucun planning défini pour le moment.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-navy-500">Événements réalisés</span>
              <span className="text-sm font-extrabold text-navy-800">
                {Math.min(weekDone, weekEvents.length)}/{weekEvents.length} ·{" "}
                {formatPercent(Math.min(1, weekDone / weekEvents.length))}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-50">
              <div
                className={`h-full rounded-full ${
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
                    {WEEKDAY_LABELS_SHORT[d.day - 1]}
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
          </>
        )}
      </Card>

      {/* Stats match */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatCard label="Matchs" value={`${matchStats.length}`} />
        <StatCard label="Pts/match" value={avgPoints} />
        <StatCard label="Record" value={recordPoints} hint="points" />
      </div>

      {/* Objectifs fixés par le coach */}
      {(goals ?? []).length > 0 && (
        <Card className="mt-4">
          <CardTitle>Objectifs de la saison</CardTitle>
          <div className="space-y-3">
            {((goals ?? []) as PlayerGoal[]).map((g) => {
              const pct = Math.min(
                100,
                Number(g.target_value) > 0
                  ? (Number(g.current_value) / Number(g.target_value)) * 100
                  : 0
              );
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-navy-800">
                      {g.title}
                      {g.achieved_at && (
                        <Star size={12} className="-mt-0.5 ml-1 inline text-gold" />
                      )}
                    </p>
                    <span className="shrink-0 text-xs font-bold text-navy-500">
                      {Number(g.current_value)}/{Number(g.target_value)}
                      {g.unit ? ` ${g.unit}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-50">
                    <div
                      className={`h-full rounded-full ${g.achieved_at ? "bg-gold" : "bg-navy-700"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Historique des semaines */}
      {(summaries ?? []).length > 0 && (
        <Card className="mt-4">
          <CardTitle>Semaines passées</CardTitle>
          <div className="divide-y divide-navy-50">
            {((summaries ?? []) as WeeklySummary[]).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-navy-500">Semaine du {formatDateFr(s.week_start)}</span>
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

      {/* Derniers matchs */}
      {matchStats.length > 0 && (
        <Card className="mt-4">
          <CardTitle>Derniers matchs</CardTitle>
          <div className="divide-y divide-navy-50">
            {matchStats.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-navy-500">
                  {formatDateFr(s.match_date)}
                  <span className="ml-1.5 text-xs text-navy-300">{s.minutes} min</span>
                </span>
                <span className="text-sm font-extrabold text-navy-800">
                  {s.points} <span className="text-xs font-semibold text-navy-400">pts</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
