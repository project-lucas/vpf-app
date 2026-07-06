import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekStart, isoWeekNumber, parisNow } from "@/lib/dates";
import { completedDayStreak } from "@/lib/discipline";
import { PlanningView } from "@/components/planning/PlanningView";
import { Overline, DisplayTitle, DoubleRule } from "@/components/editorial/primitives";
import { ZapIcon, DiscordIcon } from "@/components/icons";
import { DISCORD_INVITE_URL } from "@/lib/constants";
import type { DayOutcome } from "@/components/planning/DisciplineCalendar";
import type { DayHabit } from "@/components/planning/DayActionList";
import type { EventCompletion, HabitColor, PlannedEvent } from "@/lib/types";

export const metadata = { title: "Planning — VPF" };
export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const now = parisNow();

  const [
    { data: events },
    { data: completions },
    { data: allCompletions },
    { data: habits },
    { data: todayChecks },
    { data: coachRow },
  ] = await Promise.all([
    supabase
      .from("planned_events")
      .select("*")
      .eq("player_id", user.id)
      .order("weekday")
      .order("event_time"),
    supabase
      .from("event_completions")
      .select("*")
      .eq("player_id", user.id)
      .eq("week_start", weekStart),
    // historique complet pour la série en cours (badge flamme)
    supabase
      .from("event_completions")
      .select("status, week_start, weekday, event_time")
      .eq("player_id", user.id),
    supabase
      .from("habits")
      .select("id, name, icon, color")
      .eq("player_id", user.id)
      .order("position"),
    supabase
      .from("habit_checks")
      .select("habit_id")
      .eq("player_id", user.id)
      .eq("check_date", now.date),
    supabase
      .from("players")
      .select("coach:profiles!players_coach_id_fkey(first_name, last_name, whatsapp_number)")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  // Contact coach : gardé pour l'intitulé du bouton (l'équipe échange sur Discord)
  const coach = coachRow?.coach
    ? ((Array.isArray(coachRow.coach) ? coachRow.coach[0] : coachRow.coach) as {
        first_name: string;
        last_name: string;
        whatsapp_number: string;
      } | null)
    : null;

  // habitudes cumulatives : seul l'état du jour compte ici (le pointage) ;
  // les totaux et l'historique vivent dans le dashboard
  const checkedSet = new Set(
    ((todayChecks ?? []) as { habit_id: string }[]).map((c) => c.habit_id)
  );
  const dayHabits: DayHabit[] = ((habits ?? []) as {
    id: string;
    name: string;
    icon: string;
    color: HabitColor;
  }[]).map((h) => ({ ...h, checkedToday: checkedSet.has(h.id) }));

  // série de jours entièrement bouclés (la chaîne casse sur un jour raté)
  const streak = completedDayStreak(allCompletions ?? [], now.date);

  // série que le joueur ATTEINT en bouclant aujourd'hui = série jusqu'à hier + 1.
  // Robuste au décalage : ne dépend pas de l'état de la journée en cours (donc
  // pas de double comptage si on dé-coche puis re-coche la dernière tâche).
  const streakOnComplete = completedDayStreak(allCompletions ?? [], addDays(now.date, -1)) + 1;

  // historique jour par jour (calendrier de discipline) : même définition que
  // la série — complet quand tous les pointages du jour sont "done"
  const dayHistory: Record<string, DayOutcome> = {};
  {
    const byDate = new Map<string, { done: number; total: number }>();
    for (const c of allCompletions ?? []) {
      const date = addDays(c.week_start, c.weekday - 1);
      if (date > now.date) continue;
      const entry = byDate.get(date) ?? { done: 0, total: 0 };
      entry.total++;
      if (c.status === "done") entry.done++;
      byDate.set(date, entry);
    }
    for (const [date, e] of byDate) {
      dayHistory[date] = e.done === e.total ? "complete" : e.done > 0 ? "partial" : "missed";
    }
  }

  // Focus de la semaine : le message écrit par le coach (coach_focus) prime,
  // sinon le « à améliorer » du dernier bilan du joueur
  const [{ data: lastReview }, { data: coachFocusRow }] = await Promise.all([
    supabase
      .from("weekly_reviews")
      .select("to_improve")
      .eq("player_id", user.id)
      .eq("week_start", prevWeekStart)
      .maybeSingle(),
    supabase.from("coach_focus").select("content").eq("player_id", user.id).maybeSingle(),
  ]);
  const coachFocus = coachFocusRow?.content?.trim() || null;
  const playerFocus = lastReview?.to_improve?.trim() || null;
  const focus = coachFocus
    ? { text: coachFocus, source: "coach" as const }
    : playerFocus
      ? { text: playerFocus, source: "player" as const }
      : null;

  const weekNo = String(isoWeekNumber(weekStart)).padStart(2, "0");

  return (
    <>
      {/* Header rétro : surtitre semaine → titre varsity → filet double */}
      <Overline>Planning · Semaine {weekNo}</Overline>
      <DisplayTitle className="mt-2 text-[42px]">Ma Semaine</DisplayTitle>

      <DoubleRule className="mt-3" />

      {/* Série de jours complets : fondu dans le papier. Scoreboard deux tons —
          éclair + chiffre rouge brique (le héros), « JOURS DE SUITE » navy,
          « DE PROGRESSION » en surtitre mono rouge pour la respiration. */}
      <div className="mt-5 flex items-center gap-3.5 py-2">
        <ZapIcon size={38} className="animate-zap shrink-0 text-orange" />
        <span className="ed-value text-[56px] leading-none text-orange">{streak}</span>
        <span>
          <span className="ed-display block text-[21px] leading-[0.95] text-ink">
            Jours de suite
          </span>
          <span className="ed-overline mt-1 block">De progression</span>
        </span>
      </div>
      <p className="ed-meta mt-3 text-[11px] leading-relaxed text-meta">
        {streak === 0
          ? "Lance ta série — boucle ta journée."
          : streak === 1
            ? "1 jour de suite — enchaîne."
            : "Garde le rythme — reste régulier."}
      </p>

      <PlanningView
        playerId={user.id}
        events={(events ?? []) as PlannedEvent[]}
        completions={(completions ?? []) as EventCompletion[]}
        habits={dayHabits}
        dayHistory={dayHistory}
        today={now.date}
        weekStart={weekStart}
        todayWeekday={now.isoWeekday}
        nowMinutes={now.minutesOfDay}
        focus={focus}
        streakOnComplete={streakOnComplete}
      />

      {/* Discord de l'équipe : bouton flottant en bas à droite, au-dessus de la
          barre. L'équipe échange sur Discord ; on migrera sur WhatsApp plus tard. */}
      {DISCORD_INVITE_URL && (
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Rejoindre le Discord de l'équipe"
          title={
            coach ? `Discord de l'équipe · Coach ${coach.first_name} ${coach.last_name}` : "Discord de l'équipe"
          }
          className="fixed bottom-16 right-[22px] z-40 flex h-12 w-12 items-center justify-center rounded-md border-2 border-ink bg-paper text-[#5865F2] shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8 lg:right-16"
        >
          <DiscordIcon size={24} />
        </a>
      )}
    </>
  );
}
