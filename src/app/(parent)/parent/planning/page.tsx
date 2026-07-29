import { createClient } from "@/lib/supabase/server";
import { getParentChild } from "@/lib/parent-data";
import { currentWeekStart, formatTime, parisNow } from "@/lib/dates";
import { eventLabel, WEEKDAY_LABELS } from "@/lib/constants";
import { EventTypeIcon } from "@/components/planning/EventIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EventCompletion, PlannedEvent } from "@/lib/types";

export const metadata = { title: "Planning — VPF" };
export const dynamic = "force-dynamic";

export default async function ParentPlanningPage() {
  const child = await getParentChild();
  if (!child) {
    return (
      <>
        <PageHeader title="Planning" />
        <EmptyState>Votre compte n&apos;est lié à aucun joueur actif.</EmptyState>
      </>
    );
  }

  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const [{ data: events }, { data: completions }, { data: focus }] = await Promise.all([
    supabase
      .from("planned_events")
      .select("*")
      .eq("player_id", child.playerId)
      .order("weekday")
      .order("event_time"),
    supabase
      .from("event_completions")
      .select("*")
      .eq("player_id", child.playerId)
      .eq("week_start", weekStart),
    supabase.from("coach_focus").select("content").eq("player_id", child.playerId).maybeSingle(),
  ]);

  const weekEvents = (events ?? []) as PlannedEvent[];
  const weekCompletions = (completions ?? []) as EventCompletion[];
  const todayWeekday = parisNow().isoWeekday;

  // statut d'un événement planifié : pointé fait / pas fait, ou en attente
  function statusOf(e: PlannedEvent): "done" | "not_done" | "pending" {
    const completion = weekCompletions.find(
      (c) =>
        c.planned_event_id === e.id ||
        (c.weekday === e.weekday && c.event_time === e.event_time && c.event_type === e.event_type)
    );
    return completion ? completion.status : "pending";
  }

  return (
    <>
      <PageHeader
        title="Planning de la semaine"
        subtitle={`Ce que ${child.firstName} a prévu — et ce qui est validé.`}
      />

      {focus?.content && (
        <Card className="mb-4">
          <CardTitle>Focus du coach cette semaine</CardTitle>
          <p className="text-sm text-navy-700">{focus.content}</p>
        </Card>
      )}

      {weekEvents.length === 0 ? (
        <EmptyState>Aucun planning défini pour le moment.</EmptyState>
      ) : (
        <div className="space-y-3">
          {WEEKDAY_LABELS.map((label, i) => {
            const day = i + 1;
            const dayEvents = weekEvents.filter((e) => e.weekday === day);
            if (dayEvents.length === 0) return null;
            return (
              <Card key={day}>
                <p
                  className={`mb-2 text-xs font-bold uppercase tracking-wide ${
                    day === todayWeekday ? "text-navy-800" : "text-navy-400"
                  }`}
                >
                  {label}
                  {day === todayWeekday && (
                    <Badge tone="navy" className="ml-1.5 align-middle">
                      Aujourd&apos;hui
                    </Badge>
                  )}
                </p>
                <div className="space-y-1.5">
                  {dayEvents.map((e) => {
                    const status = statusOf(e);
                    return (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm font-semibold text-navy-800">
                          <EventTypeIcon
                            type={e.event_type}
                            event={e}
                            size={13}
                            className="-mt-0.5 mr-1 inline"
                            colored
                          />
                          {eventLabel(e)}
                          <span className="ml-1.5 text-xs font-medium text-navy-400">
                            {formatTime(e.event_time)}
                          </span>
                        </span>
                        <Badge
                          tone={
                            status === "done"
                              ? "success"
                              : status === "not_done"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {status === "done" ? "Fait" : status === "not_done" ? "Pas fait" : "À venir"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
