import Link from "next/link";
import { Dumbbell, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekStart, formatDateFr, parisNow, weekStartOf } from "@/lib/dates";
import { currentStreak } from "@/lib/discipline";
import { DEFAULT_EVENT_MINUTES, EVENT_TYPES, WORK_EVENT_TYPES } from "@/lib/constants";
import {
  computeBadges,
  computeMatchRecords,
  computeXp,
  longestRun,
  twosOf,
} from "@/lib/gamification";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import { BallIcon } from "@/components/icons";
import {
  Overline,
  Serif,
  Quote,
  DoubleRule,
  SectionHead,
  Badge,
  HeroBlock,
  StatBox,
  XpBar,
  TrophyChip,
} from "@/components/editorial/primitives";
import { HabitsManager } from "@/components/habits/HabitsManager";
import { GamificationCard } from "@/components/gamification/GamificationCard";
import { HonorBoard } from "@/components/gamification/HonorBoard";
import { AddMatchButton } from "./AddMatchButton";
import { WeekSummaryCard } from "./WeekSummaryCard";
import { DashboardSections, StatsTabs } from "./DashboardSections";
import { PlayerRadar } from "./PlayerRadar";
import { ProgressChart, type ProgressPoint } from "./ProgressChart";
import { MatchList, type MatchRow } from "./MatchList";
import { ActivityTrackerCard } from "./ActivityTrackerCard";
import { WeeklyReviewCard } from "./WeeklyReviewCard";
import type { EventType, Habit, HabitWithChecks, MatchStat } from "@/lib/types";

export const metadata = { title: "Dashboard — VPF" };
export const dynamic = "force-dynamic";

const SECTION_KEYS = ["progression", "stats", "records", "matchs", "habitudes"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const requestedSection = (SECTION_KEYS as readonly string[]).includes(section ?? "")
    ? (section as SectionKey)
    : null;
  // Progression ouverte par défaut ; un ?section=… explicite prime et fait défiler
  const initialSection: SectionKey = requestedSection ?? "progression";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const weekStart = currentWeekStart();
  const today = parisNow().date;

  const [
    { data: completions },
    { data: stats },
    { data: review },
    { data: player },
    { data: habits },
    { data: allChecks },
    { data: sessionsData },
    { data: summaries },
    { data: plannedEvents },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("event_completions")
      .select("status, week_start, weekday, event_time, event_type, duration_minutes")
      .eq("player_id", user.id),
    supabase
      .from("match_stats")
      .select("*")
      .eq("player_id", user.id)
      .order("match_date", { ascending: false }),
    supabase
      .from("weekly_reviews")
      .select("went_well, to_improve")
      .eq("player_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
    supabase
      .from("players")
      .select("season_goal, position, club")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("habits")
      .select("*")
      .eq("player_id", user.id)
      .order("position"),
    supabase
      .from("habit_checks")
      .select("habit_id, check_date")
      .eq("player_id", user.id),
    supabase
      .from("session_completions")
      .select(
        "updated_at, assignment:session_assignments(session:library_sessions(pole, duration_minutes))"
      )
      .eq("player_id", user.id)
      .eq("status", "done"),
    supabase
      .from("weekly_summaries")
      .select("week_start, planned_count, done_count")
      .eq("player_id", user.id),
    supabase.from("planned_events").select("event_type").eq("player_id", user.id),
    supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const allCompletions = completions ?? [];
  const matchStats = (stats ?? []) as MatchStat[];

  const streak = currentStreak(allCompletions);

  const avgPoints =
    matchStats.length > 0
      ? matchStats.reduce((sum, s) => sum + s.points, 0) / matchStats.length
      : null;

  // ---- Match record (badge "Record" dans la liste) : parcours chronologique
  // avec > strict — à égalité, c'est le match qui a ÉTABLI le record qui le
  // garde (une égalité ne bat pas un record) ----
  const maxPointsMatch = [...matchStats]
    .reverse()
    .reduce<MatchStat | null>((max, m) => (max === null || m.points > max.points ? m : max), null);

  // ---- Records perso (tableau d'honneur) et radar ----
  const records = computeMatchRecords(matchStats);

  const radarMatches = matchStats.map((s) => ({
    points: s.points,
    minutes: s.minutes,
    rebounds: s.rebounds,
    steals: s.steals,
  }));
  // ---- Suivi automatique des activités planifiées : dès qu'un type
  // d'événement est au planning, sa carte apparaît dans la section Habitudes,
  // alimentée par les pointages « fait » ----
  const plannedTypeSet = new Set(
    ((plannedEvents ?? []) as { event_type: EventType }[]).map((e) => e.event_type)
  );
  const activityTrackers = EVENT_TYPES.filter((t) => plannedTypeSet.has(t)).map((type) => {
    const done = allCompletions.filter((c) => c.event_type === type && c.status === "done");
    return {
      type,
      total: done.length,
      checkDates: [...new Set(done.map((c) => addDays(c.week_start, c.weekday - 1)))],
    };
  });

  // ---- Habitudes : cumulatives (compteurs + historique, badges/XP) ----
  const habitList = (habits ?? []) as Habit[];
  const allHabitChecks = (allChecks ?? []) as { habit_id: string; check_date: string }[];
  const allChecksByHabit = new Map<string, string[]>();
  for (const c of allHabitChecks) {
    if (!allChecksByHabit.has(c.habit_id)) allChecksByHabit.set(c.habit_id, []);
    allChecksByHabit.get(c.habit_id)!.push(c.check_date);
  }
  const habitsWithChecks: HabitWithChecks[] = habitList.map((h) => ({
    ...h,
    checkDates: allChecksByHabit.get(h.id) ?? [],
  }));

  // ---- Séances terminées, avec leur pôle (courbe de croissance) ----
  const sessionRows = (sessionsData ?? []).map((r) => {
    const assignment = Array.isArray(r.assignment) ? r.assignment[0] : r.assignment;
    const session =
      assignment && (Array.isArray(assignment.session) ? assignment.session[0] : assignment.session);
    return {
      updated_at: String(r.updated_at),
      pole: (session?.pole ?? "basket") as string,
      durationMinutes: (session?.duration_minutes ?? 45) as number,
    };
  });

  // ---- Temps de travail hebdo : moyenne d'heures consacrées à la progression
  // (entraînements club, séances technique/physique, routines). On utilise la
  // durée réelle figée au pointage (fallback : durée par défaut du type) et la
  // durée réelle des séances de la bibliothèque. École, sommeil et nutrition
  // ne comptent pas. ----
  const progressDates: string[] = [];
  let totalProgressMinutes = 0;
  for (const c of allCompletions) {
    if (c.status !== "done") continue;
    if (!WORK_EVENT_TYPES.has(c.event_type as EventType)) continue;
    totalProgressMinutes += c.duration_minutes ?? DEFAULT_EVENT_MINUTES[c.event_type as EventType];
    progressDates.push(addDays(c.week_start, c.weekday - 1));
  }
  for (const s of sessionRows) {
    totalProgressMinutes += s.durationMinutes;
    progressDates.push(parisNow(new Date(s.updated_at)).date);
  }
  // moyenne sur chacune de ses semaines d'activité : on ne divise que par les
  // semaines où il a agi — les semaines vides ne diluent pas la moyenne
  const activeWeeks = new Set(progressDates.map((d) => weekStartOf(d)));
  const avgWeeklyMinutes = activeWeeks.size ? totalProgressMinutes / activeWeeks.size : 0;

  // ---- Totaux carrière (style Call of) : tout ce qui a été validé depuis
  // le début, séances de la bibliothèque + événements du planning ----
  const TECH_EVENTS = new Set(["entrainement_club", "training_basket"]);
  const PHYS_EVENTS = new Set(["prep_physique", "mobilite"]);
  const doneEvents = allCompletions.filter((c) => c.status === "done");
  const totalTechnique =
    sessionRows.filter((s) => s.pole === "basket").length +
    doneEvents.filter((c) => TECH_EVENTS.has(c.event_type)).length;
  const totalPhysique =
    sessionRows.filter((s) => s.pole !== "basket").length +
    doneEvents.filter((c) => PHYS_EVENTS.has(c.event_type)).length;

  // ---- Gamification : XP, niveau, badges ----
  const xp = computeXp({
    eventsDone: allCompletions.filter((c) => c.status === "done").length,
    habitChecks: allHabitChecks.length,
    sessionsDone: sessionRows.length,
    matches: matchStats.length,
  });
  const bestHabitRun = Math.max(
    0,
    ...[...allChecksByHabit.values()].map((dates) => longestRun(dates))
  );
  const oldestMatch = matchStats[matchStats.length - 1];
  const badges = computeBadges({
    bestHabitRun,
    matchCount: matchStats.length,
    recordBeaten:
      matchStats.length >= 2 && maxPointsMatch !== null && maxPointsMatch.id !== oldestMatch.id,
    perfectWeekCount: (summaries ?? []).filter(
      (s) => s.planned_count > 0 && s.done_count >= s.planned_count
    ).length,
    sessionsDone: sessionRows.length,
    habitChecks: allHabitChecks.length,
    eventsDone: doneEvents.length,
    hasDoubleDouble: matchStats.some((m) => m.points >= 10 && m.rebounds >= 10),
    bestThreesInMatch: Math.max(0, ...matchStats.map((m) => m.threes_made ?? 0)),
    level: xp.level,
  });

  // ---- Ma semaine : discipline en cours vs semaine dernière ----
  const weekPlannedCount = (plannedEvents ?? []).length;
  const weekDoneCount = allCompletions.filter(
    (c) => c.week_start === weekStart && c.status === "done"
  ).length;
  const lastWeekSummary =
    (summaries ?? []).find((s) => s.week_start === addDays(weekStart, -7)) ?? null;

  // ---- Adresse carrière : tous les tirs renseignés, cumulés ----
  const careerShooting = matchStats.reduce(
    (acc, m) => {
      if (m.shots_made != null && m.shots_attempted != null) {
        acc.fgMade += m.shots_made;
        acc.fgAttempted += m.shots_attempted;
      }
      if (m.threes_made != null && m.threes_attempted != null) {
        acc.threeMade += m.threes_made;
        acc.threeAttempted += m.threes_attempted;
      }
      return acc;
    },
    { fgMade: 0, fgAttempted: 0, threeMade: 0, threeAttempted: 0 }
  );

  // ---- Courbe de croissance : XP cumulés JOUR PAR JOUR, par dimension.
  // Chaque action validée pose un point le jour même ; le scoring d'un match
  // nourrit la courbe à hauteur des points marqués. La courbe ne redescend
  // jamais — chaque jour d'activité ajoute son incrément au cumul. ----
  const daily = new Map<string, { technique: number; physique: number; vie: number }>();
  const bump = (date: string, dim: "technique" | "physique" | "vie", amount: number) => {
    const entry = daily.get(date) ?? { technique: 0, physique: 0, vie: 0 };
    entry[dim] += amount;
    daily.set(date, entry);
  };
  for (const c of allCompletions) {
    if (c.status !== "done") continue;
    const dim = TECH_EVENTS.has(c.event_type)
      ? "technique"
      : PHYS_EVENTS.has(c.event_type)
        ? "physique"
        : "vie";
    // date réelle du pointage : lundi de la semaine + (jour - 1)
    bump(addDays(c.week_start, c.weekday - 1), dim, 10);
  }
  for (const s of sessionRows) {
    // updated_at est un timestamp UTC → converti en date Paris
    bump(parisNow(new Date(s.updated_at)).date, s.pole === "basket" ? "technique" : "physique", 20);
  }
  for (const c of allHabitChecks) bump(c.check_date, "vie", 5);
  // scoring : chaque match nourrit la courbe à hauteur des points marqués
  // (bump même à 0 point → le jour de match reste un point sur la courbe)
  for (const m of matchStats) bump(m.match_date, "technique", m.points);

  // jours où un record est strictement battu (le 1er match établit, ne bat pas)
  const recordDays = new Set<string>();
  {
    const maxes: Record<string, number | null> = {
      points: null,
      twos: null,
      threes: null,
      rebounds: null,
      steals: null,
    };
    for (const m of [...matchStats].reverse()) {
      const values: Record<string, number | null> = {
        points: m.points,
        twos: twosOf(m),
        threes: m.threes_made,
        rebounds: m.rebounds,
        steals: m.steals,
      };
      let beaten = false;
      for (const key of Object.keys(values)) {
        const value = values[key];
        if (value == null) continue;
        if (maxes[key] !== null && value > maxes[key]!) beaten = true;
        if (maxes[key] === null || value > maxes[key]!) maxes[key] = value;
      }
      if (beaten) recordDays.add(m.match_date);
    }
  }

  const activeDays = [...daily.keys()].sort();
  const progressData: ProgressPoint[] = [];
  {
    const cumulative = { technique: 0, physique: 0, vie: 0 };
    for (const day of activeDays) {
      const inc = daily.get(day)!;
      cumulative.technique += inc.technique;
      cumulative.physique += inc.physique;
      cumulative.vie += inc.vie;
      const total = cumulative.technique + cumulative.physique + cumulative.vie;
      progressData.push({
        label: day.slice(8, 10) + "/" + day.slice(5, 7),
        technique: cumulative.technique,
        physique: cumulative.physique,
        vie: cumulative.vie,
        total,
        recordDot: recordDays.has(day) ? total : null,
      });
    }
  }

  // XP gagnés depuis le lundi courant (sous-titre « +N cette semaine »)
  let weekGain = 0;
  for (const [day, inc] of daily) {
    if (day >= weekStart) weekGain += inc.technique + inc.physique + inc.vie;
  }

  // tendance vs le match précédent (chronologiquement) ; le tout premier
  // match enregistré n'a pas de point de comparaison
  const matchRows: MatchRow[] = matchStats.map((s, i) => {
    const prev = matchStats[i + 1];
    return {
      id: s.id,
      dateLabel: formatDateFr(s.match_date),
      minutes: s.minutes,
      rebounds: s.rebounds,
      steals: s.steals,
      points: s.points,
      shots:
        s.shots_made != null && s.shots_attempted != null
          ? { made: s.shots_made, attempted: s.shots_attempted }
          : null,
      threes:
        s.threes_made != null && s.threes_attempted != null
          ? { made: s.threes_made, attempted: s.threes_attempted }
          : null,
      delta: prev ? s.points - prev.points : null,
      isRecord: maxPointsMatch?.id === s.id,
    };
  });

  // ---- Hero rétro : saison, écusson, méta, trophées phares ----
  const [seasonY, seasonM] = today.split("-").map(Number);
  const startYear = seasonM >= 8 ? seasonY : seasonY - 1;
  const season = `${String(startYear).slice(2)}/${String(startYear + 1).slice(2)}`;
  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase();
  const clubSkip = new Set(["as", "us", "es", "sc", "bc", "club", "basket", "de", "la", "le"]);
  const clubWord = String(player?.club ?? "")
    .split(/\s+/)
    .find((w: string) => !clubSkip.has(w.toLowerCase()) && w.length > 1);
  const clubTag = clubWord ? `${clubWord.toUpperCase().slice(0, 6)} · 01` : undefined;
  const metaParts = [player?.position, player?.club, `Niv.${xp.level}`].filter(
    Boolean
  ) as string[];
  const findBadge = (key: string) => badges.find((b) => b.key === key);
  const earnedBadges = badges.filter((b) => b.earned).length;
  const chips = [
    { badge: findBadge("premier-match"), label: "1er match" },
    { badge: findBadge("matchs-5"), label: "5 matchs" },
    { badge: findBadge("serie-7"), label: "Série 7" },
  ];

  return (
    <>
      {/* En-tête : écusson + surtitre saison + nom serif */}
      <div className="flex items-center gap-4">
        <Badge initials={initials} tag={clubTag} size={62} />
        <div className="min-w-0">
          <Overline>Dashboard · Saison {season}</Overline>
          <Serif className="mt-1 text-[32px] leading-[0.95]">
            {profile?.first_name}
            <br />
            {profile?.last_name}
          </Serif>
        </div>
      </div>
      {metaParts.length > 0 && (
        <p className="ed-meta mt-3 text-[11px] text-meta">{metaParts.join(" — ")}</p>
      )}

      <DoubleRule className="mt-4" />

      {player?.season_goal && (
        <div className="mt-5 text-center">
          <Overline>Objectif de saison</Overline>
          <Quote className="mt-2 text-lg">{player.season_goal}</Quote>
        </div>
      )}

      {/* Points par match : bloc héros navy, la métrique reine */}
      <HeroBlock className="mt-5">
        <div className="text-center">
          <p className="ed-value text-[68px] text-paper">
            {avgPoints !== null ? avgPoints.toFixed(1) : "—"}
          </p>
          <p className="ed-overline mt-1 text-warm">Points par match</p>
        </div>
      </HeroBlock>

      {/* 3 indicateurs clés */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatBox value={`${streak} J`} label="Série" />
        <StatBox value={formatWeeklyTime(avgWeeklyMinutes)} label="Temps/sem" />
        <StatBox value={`${weekDoneCount}/${weekPlannedCount}`} label="Séances" />
      </div>

      {/* Progression XP */}
      <XpBar className="mt-5" value={xp.levelXp} max={xp.levelTarget} />

      {/* Trophées phares */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {chips.map((c) => (
          <TrophyChip
            key={c.label}
            label={c.label}
            unlocked={Boolean(c.badge?.earned)}
            value={c.badge?.progress?.current ?? "•"}
          />
        ))}
        <TrophyChip label="Trophées" unlocked={earnedBadges > 0} value={`${earnedBadges}/16`} />
      </div>

      {/* Feuille de match : saisie d'un nouveau match */}
      <div className="mt-5">
        <AddMatchButton records={records} variant="cta" />
      </div>

      <SectionHead className="mb-4 mt-8">Analyse détaillée</SectionHead>

      {/* Zone 2 — barre d'icônes dépliables : une section ouverte à la fois */}
      <DashboardSections
        initialOpen={initialSection}
        autoScroll={requestedSection !== null}
        progression={
          <>
            <WeekSummaryCard
              plannedCount={weekPlannedCount}
              doneCount={weekDoneCount}
              lastWeek={
                lastWeekSummary
                  ? { planned: lastWeekSummary.planned_count, done: lastWeekSummary.done_count }
                  : null
              }
            />
            {/* Totaux carrière : les compteurs à vie, façon Call of */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <CareerTotal
                label="Séances techniques"
                value={totalTechnique}
                icon={<BallIcon size={16} />}
              />
              <CareerTotal
                label="Séances physiques"
                value={totalPhysique}
                icon={<Dumbbell size={16} strokeWidth={2.2} />}
              />
            </div>
            <GamificationCard xp={xp} badges={badges} storageScope={user.id} />
          </>
        }
        stats={
          <StatsTabs
            growth={
              progressData.length > 1 ? (
                <ProgressChart data={progressData} weekGain={weekGain} />
              ) : (
                <EmptyState
                  icon={<TrendingUp size={28} strokeWidth={1.8} />}
                  action={
                    <Link
                      href="/planning"
                      className="ed-value inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2.5 text-sm text-paper transition-colors hover:brightness-110"
                    >
                      Pointer mes activités →
                    </Link>
                  }
                >
                  <p className="ed-value text-base text-ink">Ta courbe démarre bientôt.</p>
                  <p className="mt-1 font-body text-sm text-meta">
                    Pointe tes événements, tiens tes habitudes : dès ta deuxième semaine
                    d&apos;activité, ta croissance s&apos;affiche ici.
                  </p>
                </EmptyState>
              )
            }
            radar={
              matchStats.length > 0 ? (
                <PlayerRadar matches={radarMatches} />
              ) : (
                <EmptyState
                  icon={<BallIcon size={28} />}
                  action={<AddMatchButton records={records} variant="cta" />}
                >
                  <p className="ed-value text-base text-ink">Pas encore de profil joueur.</p>
                  <p className="mt-1 font-body text-sm text-meta">
                    Saisis ton premier match pour dessiner ton radar.
                  </p>
                </EmptyState>
              )
            }
          />
        }
        records={<HonorBoard records={records} shooting={careerShooting} />}
        matchs={
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="ed-value text-lg text-ink">Mes derniers matchs</h2>
              <AddMatchButton records={records} />
            </div>
            {matchStats.length === 0 ? (
              <EmptyState
                icon={<BallIcon size={28} />}
                action={<AddMatchButton records={records} variant="cta" />}
              >
                <p className="ed-value text-base text-ink">Ton premier match t&apos;attend.</p>
                <p className="mt-1 font-body text-sm text-meta">
                  Saisis-le et commence à construire tes stats de la saison.
                </p>
              </EmptyState>
            ) : (
              <MatchList rows={matchRows} />
            )}
          </>
        }
        habitudes={
          <>
            {activityTrackers.length > 0 && (
              <>
                <div className="mb-3">
                  <p className="ed-value text-lg text-ink">Mes activités</p>
                  <p className="mt-1 font-body text-xs text-meta">
                    Suivies automatiquement depuis ton planning : chaque pointage
                    s&apos;additionne.
                  </p>
                </div>
                <div className="space-y-3">
                  {activityTrackers.map((t) => (
                    <ActivityTrackerCard
                      key={t.type}
                      type={t.type}
                      checkDates={t.checkDates}
                      total={t.total}
                      today={today}
                    />
                  ))}
                </div>
                <div className="my-4 border-t border-hair" />
              </>
            )}

            <HabitsManager habits={habitsWithChecks} today={today} />

            <div className="my-4 border-t border-hair" />

            {/* Bilan hebdomadaire, replié par défaut */}
            <WeeklyReviewCard
              hasReview={Boolean(review)}
              initialWentWell={review?.went_well ?? ""}
              initialToImprove={review?.to_improve ?? ""}
            />
          </>
        }
      />
    </>
  );
}

/** Compteur carrière : total à vie sur fond navy, gros chiffre doré. */
function CareerTotal({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md border-2 border-ink bg-ink px-3 py-3 text-center">
      <p className="ed-value flex items-center justify-center gap-1.5 text-[30px] text-warm">
        {icon}
        <CountUp value={value} />
      </p>
      <p className="ed-meta mt-1.5 text-[8px] text-paper/70">{label}</p>
    </div>
  );
}

/** Temps hebdo formaté pour la tuile KPI : « 5 h », « 4h30 », ou « — » si trop peu. */
function formatWeeklyTime(min: number): string {
  if (min < 20) return "—";
  const halves = Math.max(1, Math.round(min / 30));
  const h = Math.floor(halves / 2);
  const half = halves % 2;
  if (h < 1) return "30 min";
  return half ? `${h}h30` : `${h} h`;
}
