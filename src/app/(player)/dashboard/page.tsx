import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { addDays, currentWeekStart, formatDateFr, parisNow, seasonLabel } from "@/lib/dates";
import { EVENT_TYPES, SEASON_START } from "@/lib/constants";
import {
  computeBadges,
  computeMatchRecords,
  computeXp,
  longestRun,
  XP_VALUES,
} from "@/lib/gamification";
import { EmptyState } from "@/components/ui/EmptyState";
import { BallIcon } from "@/components/icons";
import {
  Overline,
  Serif,
  Quote,
  DoubleRule,
  SectionHead,
  Badge,
} from "@/components/editorial/primitives";
import { GamificationCard } from "@/components/gamification/GamificationCard";
import { HonorBoard } from "@/components/gamification/HonorBoard";
import { ScoreBoard } from "./ScoreBoard";
import { AddMatchButton } from "./AddMatchButton";
import { WeekSummaryCard } from "./WeekSummaryCard";
import { DashboardSections, StatsTabs } from "./DashboardSections";
import { PlayerRadar } from "./PlayerRadar";
import { ProgressChart, type ProgressPoint } from "./ProgressChart";
import { MatchList, type MatchRow } from "./MatchList";
import { ActivityTrackerCard } from "./ActivityTrackerCard";
import { GoalsCard } from "./GoalsCard";
import type { EventType, MatchStat, PlayerGoal } from "@/lib/types";

export const metadata = { title: "Dashboard — VPF" };
export const dynamic = "force-dynamic";

const SECTION_KEYS = ["progression", "stats", "records", "matchs", "historique"] as const;
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
  const user = await getCachedUser();
  if (!user) return null;

  const weekStart = currentWeekStart();
  const today = parisNow().date;

  const [
    { data: completions },
    { data: stats },
    { data: player },
    { data: allChecks },
    { data: sessionsData },
    { data: summaries },
    { data: plannedEvents },
    { data: profile },
    { data: goals },
  ] = await Promise.all([
    supabase
      .from("event_completions")
      .select(
        "status, week_start, weekday, event_time, event_type, duration_minutes, custom_name, custom_icon, custom_color"
      )
      .eq("player_id", user.id),
    supabase
      .from("match_stats")
      .select("*")
      .eq("player_id", user.id)
      .order("match_date", { ascending: false }),
    supabase
      .from("players")
      .select("season_goal, position, club")
      .eq("id", user.id)
      .maybeSingle(),
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
    supabase
      .from("planned_events")
      .select("event_type, custom_name, custom_icon, custom_color")
      .eq("player_id", user.id),
    supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("player_goals")
      .select("*")
      .eq("player_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const allCompletions = completions ?? [];
  const matchStats = (stats ?? []) as MatchStat[];


  const avgPoints =
    matchStats.length > 0
      ? matchStats.reduce((sum, s) => sum + s.points, 0) / matchStats.length
      : null;

  // Temps de jeu moyen (minutes par match) — issu de l'historique des feuilles de match
  const avgMinutes =
    matchStats.length > 0
      ? matchStats.reduce((sum, s) => sum + s.minutes, 0) / matchStats.length
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
    threes_made: s.threes_made,
    twos_inside_made: s.twos_inside_made,
    twos_outside_made: s.twos_outside_made,
    free_throws_made: s.free_throws_made,
    fouls: s.fouls,
  }));
  // ---- Suivi automatique des activités planifiées : dès qu'un type
  // d'événement est au planning, sa carte apparaît dans la section Habitudes,
  // alimentée par les pointages « fait » ----
  // union planning actuel + historique : retirer un type du planning ne fait
  // pas disparaître son historique cumulé (« sur toute l'année »)
  const plannedTypeSet = new Set(
    ((plannedEvents ?? []) as { event_type: EventType }[]).map((e) => e.event_type)
  );
  for (const c of allCompletions) {
    if (c.status === "done") plannedTypeSet.add(c.event_type as EventType);
  }
  const activityTrackers = EVENT_TYPES.filter((t) => plannedTypeSet.has(t)).map((type) => {
    const done = allCompletions.filter((c) => c.event_type === type && c.status === "done");
    return {
      type,
      total: done.length,
      checkDates: [...new Set(done.map((c) => addDays(c.week_start, c.weekday - 1)))],
    };
  });

  // Activités perso (« autre ») : suivies elles aussi, groupées par nom —
  // l'icône/couleur du planning fait foi, les pointages viennent du snapshot
  const customPlanned = (
    (plannedEvents ?? []) as {
      event_type: EventType;
      custom_name: string;
      custom_icon: string;
      custom_color: string;
    }[]
  ).filter((e) => e.event_type === "autre" && e.custom_name);
  const customMeta = new Map<string, { icon: string; color: string }>();
  for (const e of customPlanned) {
    if (!customMeta.has(e.custom_name)) {
      customMeta.set(e.custom_name, { icon: e.custom_icon, color: e.custom_color });
    }
  }
  // activités perso retirées du planning : l'historique reste visible via le
  // snapshot (icône/couleur) porté par les pointages
  for (const c of allCompletions) {
    if (c.event_type === "autre" && c.custom_name && c.status === "done" && !customMeta.has(c.custom_name)) {
      customMeta.set(c.custom_name, { icon: c.custom_icon || "flame", color: c.custom_color || "red" });
    }
  }
  const customTrackers = [...customMeta.entries()].map(([name, meta]) => {
    const done = allCompletions.filter(
      (c) => c.event_type === "autre" && c.custom_name === name && c.status === "done"
    );
    return {
      name,
      icon: meta.icon,
      color: meta.color,
      total: done.length,
      checkDates: [...new Set(done.map((c) => addDays(c.week_start, c.weekday - 1)))],
    };
  });

  // ---- Anciennes habitudes manuelles : la fonctionnalité est retirée (les
  // activités perso du planning la remplacent) mais les checks historiques
  // continuent de compter pour l'XP et les badges — personne ne perd rien ----
  const allHabitChecks = (allChecks ?? []) as { habit_id: string; check_date: string }[];
  const allChecksByHabit = new Map<string, string[]>();
  for (const c of allHabitChecks) {
    if (!allChecksByHabit.has(c.habit_id)) allChecksByHabit.set(c.habit_id, []);
    allChecksByHabit.get(c.habit_id)!.push(c.check_date);
  }

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
  // Badges « Série de N » : meilleure suite de jours actifs — jours avec au
  // moins un pointage « fait » au planning, ou runs des anciennes habitudes
  // (conservés pour ne pas retirer un badge déjà gagné)
  const activeDayDates = new Set(doneEvents.map((c) => addDays(c.week_start, c.weekday - 1)));
  const bestHabitRun = Math.max(
    0,
    longestRun(activeDayDates),
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
    hasBigGame: matchStats.some((m) => m.points >= 20),
    bestThreesInMatch: Math.max(0, ...matchStats.map((m) => m.threes_made)),
    level: xp.level,
  });

  // ---- Ma semaine : discipline en cours vs semaine dernière ----
  const weekPlannedCount = (plannedEvents ?? []).length;
  const weekDoneCount = allCompletions.filter(
    (c) => c.week_start === weekStart && c.status === "done"
  ).length;
  const lastWeekSummary =
    (summaries ?? []).find((s) => s.week_start === addDays(weekStart, -7)) ?? null;

  // ---- Courbe de croissance : XP cumulés JOUR PAR JOUR, par dimension.
  // Mêmes barèmes que computeXp (XP_VALUES) : le total de la courbe recolle
  // exactement avec l'XP de « Ma progression ». La courbe ne redescend
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
    bump(addDays(c.week_start, c.weekday - 1), dim, XP_VALUES.eventDone);
  }
  for (const s of sessionRows) {
    // updated_at est un timestamp UTC → converti en date Paris
    bump(
      parisNow(new Date(s.updated_at)).date,
      s.pole === "basket" ? "technique" : "physique",
      XP_VALUES.sessionDone
    );
  }
  for (const c of allHabitChecks) bump(c.check_date, "vie", XP_VALUES.habitCheck);
  // chaque match crédite le même XP que computeXp (le jour reste un point sur la courbe)
  for (const m of matchStats) bump(m.match_date, "technique", XP_VALUES.match);

  // jours où un record est strictement battu (le 1er match établit, ne bat pas)
  const recordDays = new Set<string>();
  {
    const maxes: Record<string, number | null> = {
      points: null,
      shots: null,
      threes: null,
      twosInside: null,
      twosOutside: null,
      freeThrows: null,
    };
    for (const m of [...matchStats].reverse()) {
      const values: Record<string, number> = {
        points: m.points,
        shots: m.shots_made,
        threes: m.threes_made,
        twosInside: m.twos_inside_made,
        twosOutside: m.twos_outside_made,
        freeThrows: m.free_throws_made,
      };
      let beaten = false;
      for (const key of Object.keys(values)) {
        const value = values[key];
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
        iso: day,
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
      isStarter: s.is_starter,
      minutes: s.minutes,
      points: s.points,
      threes: s.threes_made,
      twos: s.twos_inside_made + s.twos_outside_made,
      freeThrows: s.free_throws_made,
      delta: prev ? s.points - prev.points : null,
      isRecord: maxPointsMatch?.id === s.id,
    };
  });

  // ---- Hero rétro : saison, écusson, méta, trophées phares ----
  // (dérivée de SEASON_START : bascule le 1er septembre, comme « Jour X de ta saison »)
  const season = seasonLabel(today, SEASON_START);
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

      {/* Tableau d'affichage vintage : moyenne de points (cartons à volet) + bandeau stats */}
      <ScoreBoard
        average={avgPoints}
        technique={totalTechnique}
        jeuMoy={avgMinutes}
        physique={totalPhysique}
      />

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
            <GoalsCard goals={(goals ?? []) as PlayerGoal[]} />
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
                    Pointe tes événements, tiens tes habitudes : dès ton deuxième jour
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
        records={<HonorBoard records={records} />}
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
        historique={
          activityTrackers.length > 0 || customTrackers.length > 0 ? (
            <>
              <div className="mb-3">
                <p className="ed-value text-lg text-ink">Mon historique</p>
                <p className="mt-1 font-body text-xs text-meta">
                  Chaque tâche de ton planning a sa carte : les pointages
                  «&nbsp;fait&nbsp;» s&apos;additionnent automatiquement, sur toute
                  l&apos;année.
                </p>
              </div>
              <div className="space-y-3">
                {activityTrackers.map((t) => (
                  <ActivityTrackerCard
                    key={t.type}
                    type={t.type}
                    checkDates={t.checkDates}
                    today={today}
                  />
                ))}
                {customTrackers.map((t) => (
                  <ActivityTrackerCard
                    key={`custom-${t.name}`}
                    type="autre"
                    custom={{ name: t.name, icon: t.icon, color: t.color }}
                    checkDates={t.checkDates}
                    today={today}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={<TrendingUp size={28} />}>
              <p className="ed-value text-base text-ink">
                Ton historique se construit depuis ton planning.
              </p>
              <p className="mt-1 font-body text-sm text-meta">
                Ajoute des tâches à ta semaine (onglet Planning → Modifier ma
                semaine) : chacune aura sa carte ici, avec son historique annuel.
              </p>
            </EmptyState>
          )
        }
      />
    </>
  );
}

