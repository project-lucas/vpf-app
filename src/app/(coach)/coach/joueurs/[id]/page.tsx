import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getConversationMessages } from "@/app/actions/messages";
import { ConversationPanel } from "@/components/messages/ConversationPanel";
import { getConversationChannels } from "@/lib/conversations";
import { getNavRole } from "@/lib/auth";
import {
  ageFromBirthdate,
  currentWeekStart,
  formatAgoFr,
  formatDateFr,
  formatTime,
  parisNow,
} from "@/lib/dates";
import { computeBadges, computeXp, levelTitle, longestRun } from "@/lib/gamification";
import { HabitCard } from "@/components/habits/HabitCard";
import { PlayerRadar } from "@/app/(player)/dashboard/PlayerRadar";
import { HeartPulse, History, ListChecks, MessageCircle, Star, Target, Zap } from "lucide-react";
import {
  AVAILABILITY_LABELS,
  channelKey,
  eventLabel,
  REVIEW_HEALTH_LABELS,
  STAFF_CHANNEL_KEY,
  WEEKDAY_LABELS,
} from "@/lib/constants";
import { EventTypeIcon } from "@/components/planning/EventIcon";
import { formatPercent } from "@/lib/discipline";
import { disciplineTrend } from "@/lib/staff-overview";
import { ScoringChart } from "@/components/coach/ScoringChart";
import { WeekDaysCard, type DayDetail, type DayItem } from "@/components/coach/WeekDaysCard";
import { SessionSuggestionsCard } from "@/components/coach/SessionSuggestionsCard";
import {
  assignedConflicts,
  normalizePosition,
  painZonesFromNotes,
  positionFit,
  sessionsToAvoid,
  suggestSessions,
  ZONE_LABELS,
} from "@/lib/session-suggestions";
import { EVENT_TYPE_LABELS, formatDuration } from "@/lib/constants";
import { JarvisPlayerButton } from "@/components/coach/JarvisPlayerBox";
import { PlayerMemoryCard } from "@/components/coach/PlayerMemoryCard";
import { getPlayerMemories } from "@/lib/player-memory";
import { getBriefsForDate, isMorningBriefConfigured, type BriefRecommendation } from "@/lib/briefs";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardTitle } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeftIcon } from "@/components/icons";
import { PlanningEditor } from "@/components/planning/PlanningEditor";
import { DisclosureBar } from "@/components/ui/DisclosureBar";
import { PlayerProfileForm } from "./PlayerProfileForm";
import { WeekFocusForm } from "./WeekFocusForm";
import { AssignedSessionsManager } from "./AssignedSessionsManager";
import { CoachNotesPanel } from "./CoachNotesPanel";
import { ReviewReplyBox } from "@/components/coach/ReviewReplyBox";
import { RowMenu } from "@/components/coach/RowMenu";
import { CopyWeekTemplate } from "@/components/coach/CopyWeekTemplate";
import { GoalsManager } from "@/components/coach/GoalsManager";
import { PlayerWhatsAppLink } from "@/components/coach/PlayerWhatsAppLink";
import { PlayerHygieneCard } from "@/components/coach/PlayerHygieneCard";
import { PlayerHygieneVideosCard } from "@/components/coach/PlayerHygieneVideosCard";
import { PlayerParentsCard } from "@/components/coach/PlayerParentsCard";
import { getPlayerParents } from "@/lib/parents";
import { PlayerNotificationsCard } from "@/components/coach/PlayerNotificationsCard";
import { PlayerGroupSelect } from "@/components/coach/PlayerGroupSelect";
import { countPushDevices } from "@/lib/push";
import { OFFER_LABELS, canUseHygiene, toOffer } from "@/lib/offers";
import type {
  Checkin,
  CoachNote,
  EventCompletion,
  Habit,
  HabitWithChecks,
  HygieneLog,
  HygieneVideo,
  LibrarySession,
  MatchStat,
  PlannedEvent,
  PlayerAvailability,
  PlayerGoal,
  SessionAssignmentWithSession,
  WeeklyReview,
  WeeklySummary,
} from "@/lib/types";

export const metadata = { title: "Fiche joueur — VPF" };
export const dynamic = "force-dynamic";

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string; canal?: string }>;
}) {
  const { id } = await params;
  const { onglet, canal } = await searchParams;
  // canal ouvert d'entrée dans l'onglet Messages (lien depuis la liste, push)
  const initialChannelAdminId = canal && canal !== STAFF_CHANNEL_KEY ? canal : null;
  const supabase = await createClient();
  const user = await getCachedUser();
  const weekStart = currentWeekStart();

  // Une seule salve : toutes ces requêtes ne dépendent que de l'id de la route.
  // Les enchaîner (fiche → le reste → les autres joueurs) ajoutait deux
  // allers-retours réseau avant le premier octet de la page.
  const [
    { data: playerRaw },
    { data: otherPlayersRaw },
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
    { count: eventsDoneCount },
    { data: goals },
    { data: hygieneLogs },
    conversationMessages,
    { data: hygieneVideos },
    { data: hygieneVideoAssignments },
    { data: parentInvitations },
  ] = await Promise.all([
    supabase
      .from("players")
      .select(
        "*, profile:profiles!players_id_fkey(first_name, last_name, whatsapp_number, notifications_enabled)",
      )
      .eq("id", id)
      .maybeSingle(),
    // autres joueurs actifs du coach (RLS) — source de la copie de semaine type
    supabase
      .from("players")
      .select("id, profile:profiles!players_id_fkey(first_name, last_name)")
      .eq("status", "active")
      .neq("id", id),
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
      .order("week_start", { ascending: false }),
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
    // toutes les coches (heatmap + calcul XP/badges : séries, totaux)
    supabase.from("habit_checks").select("habit_id, check_date").eq("player_id", id),
    supabase.from("coach_focus").select("content").eq("player_id", id).maybeSingle(),
    supabase
      .from("event_completions")
      .select("id", { count: "exact", head: true })
      .eq("player_id", id)
      .eq("status", "done"),
    supabase
      .from("player_goals")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
    // hygiène : lisible par le coach référent (0025), y compris pour un joueur
    // repassé en offre perf — l'historique ne disparaît jamais de la fiche
    supabase
      .from("hygiene_logs")
      .select("*")
      .eq("player_id", id)
      .order("log_date", { ascending: false }),
    // fil de discussion du joueur (lecture RLS : coach référent + admin)
    getConversationMessages(id, initialChannelAdminId),
    // vidéothèque hygiène : catalogue complet + activations de ce joueur
    supabase.from("hygiene_videos").select("*").order("category").order("title"),
    supabase.from("hygiene_video_assignments").select("video_id").eq("player_id", id),
    // invitations parent en attente (RLS : coach référent + admin)
    supabase
      .from("parent_invitations")
      .select("id, label, created_at")
      .eq("player_id", id)
      .is("used_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (!playerRaw) notFound();
  const profile = Array.isArray(playerRaw.profile) ? playerRaw.profile[0] : playerRaw.profile;

  // Fils privés (0034) : réservés aux admins côté staff — un coach référent
  // n'y a pas accès. getNavRole ne coûte pas de requête et ne sert qu'à
  // afficher les onglets : la RLS reste seule juge de ce qui se lit.
  const isAdminViewer = (await getNavRole()) === "admin";

  // Après le notFound() seulement : la lecture ci-dessus s'est faite sous RLS,
  // c'est elle qui prouve que l'utilisateur a le droit de consulter ce joueur.
  // Le comptage et les noms des parents, eux, contournent la RLS
  // (voir countPushDevices / getPlayerParents).
  const [pushDeviceCount, playerParents, channels, { data: groups }, memories] = await Promise.all([
    countPushDevices(id),
    getPlayerParents(id),
    getConversationChannels(supabase, {
      playerId: id,
      viewerId: user?.id ?? "",
      offer: toOffer(playerRaw.offer),
      // admin : tous les fils privés ; coach référent : le sien (0037)
      includePrivate: isAdminViewer ? true : playerRaw.coach_id === user?.id ? "own" : false,
    }),
    // les groupes du service (0040) : l'étiquette de la tête de fiche, et le
    // sélecteur de l'onglet Fiche pour un admin
    supabase.from("groups").select("id, name").order("position").order("created_at"),
    // la fiche mémoire de Jarvis (0046) — staff seulement, sous RLS
    getPlayerMemories(supabase, [id]),
  ]);
  const memory = memories.get(id) ?? null;
  const groupName =
    (groups ?? []).find((g) => g.id === (playerRaw.group_id as string | null))?.name ?? null;

  // « Global » = joueur + parents + tout le staff ; un prénom = le fil privé
  // entre le joueur et ce membre du staff
  const conversationChannels = channels.map((c) => ({
    key: channelKey(c.adminId),
    adminId: c.adminId,
    label: c.adminId ? (c.adminName ?? "Staff") : "Global",
    hasUnread: c.hasUnread,
  }));

  const otherPlayers = (otherPlayersRaw ?? [])
    .map((p) => {
      const pr = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      return {
        id: p.id,
        name: `${pr?.first_name ?? ""} ${pr?.last_name ?? ""}`.trim(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

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
    matchStats.length > 0 ? matchStats.reduce((s, m) => s + m.points, 0) / matchStats.length : null;
  const avgMinutes =
    matchStats.length > 0
      ? matchStats.reduce((s, m) => s + m.minutes, 0) / matchStats.length
      : null;
  const recordPoints = matchStats.length > 0 ? Math.max(...matchStats.map((m) => m.points)) : null;
  const checkin = lastCheckin as Checkin | null;
  const age = ageFromBirthdate(playerRaw.birthdate);
  const availability = (playerRaw.availability ?? "available") as PlayerAvailability;
  const offer = toOffer(playerRaw.offer);
  const allHygieneLogs = (hygieneLogs ?? []) as HygieneLog[];

  // ---- Gamification : mêmes calculs que le dashboard joueur (XP, niveau,
  // badges) — le coach voit exactement ce que voit son joueur ----
  const allHabitChecks = (habitChecks ?? []) as {
    habit_id: string;
    check_date: string;
  }[];
  const checksByHabit = new Map<string, string[]>();
  for (const c of allHabitChecks) {
    if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, []);
    checksByHabit.get(c.habit_id)!.push(c.check_date);
  }
  const bestHabitRun = Math.max(
    0,
    ...[...checksByHabit.values()].map((dates) => longestRun(dates)),
  );
  const sessionsDone = allAssignments.filter((a) => a.completion?.status === "done").length;
  const eventsDone = eventsDoneCount ?? 0;
  const xp = computeXp({
    eventsDone,
    habitChecks: allHabitChecks.length,
    sessionsDone,
    matches: matchStats.length,
  });
  const allSummaries = (summaries ?? []) as WeeklySummary[];
  const maxPointsMatch = [...matchStats]
    .reverse()
    .reduce<MatchStat | null>((max, m) => (max === null || m.points > max.points ? m : max), null);
  const oldestMatch = matchStats[matchStats.length - 1];
  const badges = computeBadges({
    bestHabitRun,
    matchCount: matchStats.length,
    recordBeaten:
      matchStats.length >= 2 && maxPointsMatch !== null && maxPointsMatch.id !== oldestMatch.id,
    perfectWeekCount: allSummaries.filter(
      (s) => s.planned_count > 0 && s.done_count >= s.planned_count,
    ).length,
    sessionsDone,
    habitChecks: allHabitChecks.length,
    eventsDone,
    hasBigGame: matchStats.some((m) => m.points >= 20),
    bestThreesInMatch: Math.max(0, ...matchStats.map((m) => m.threes_made)),
    level: xp.level,
  });
  const earnedBadges = badges.filter((b) => b.earned);

  const radarMatches = matchStats.map((s) => ({
    points: s.points,
    minutes: s.minutes,
    threes_made: s.threes_made,
    twos_inside_made: s.twos_inside_made,
    twos_outside_made: s.twos_outside_made,
    free_throws_made: s.free_throws_made,
    fouls: s.fouls,
  }));

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

  // ---- « Sa semaine » : pour chaque jour, les créneaux du planning (pointés
  //      ou non) et les séances du programme, cliquables sur la fiche
  const weekDetail: DayDetail[] = dayBreakdown.map((d) => {
    const events = weekEvents
      .filter((e) => e.weekday === d.day)
      .sort((a, b) => (a.event_time < b.event_time ? -1 : 1))
      .map((e): DayItem => {
        const c = weekCompletions.find((x) => x.planned_event_id === e.id);
        return {
          label: (e.event_type === "autre" && e.custom_name) || EVENT_TYPE_LABELS[e.event_type],
          when: `${e.event_time.slice(0, 5)} · ${formatDuration(e.duration_minutes)}`,
          status: c ? (c.status === "done" ? "done" : "not_done") : d.day < todayWeekday ? "not_done" : "todo",
          event: {
            id: e.id,
            type: e.event_type,
            weekday: e.weekday,
            time: e.event_time.slice(0, 5),
            duration: e.duration_minutes,
            customName: e.custom_name ?? null,
          },
        };
      });
    const sessions = allAssignments
      .filter((a) => a.weekday === d.day && !a.removed_at)
      .map((a): DayItem => ({
        label: a.session.name,
        when: "Séance du programme",
        status:
          a.completion?.status === "done"
            ? "done"
            : a.completion?.status === "not_done"
              ? "not_done"
              : d.day < todayWeekday
                ? "not_done"
                : "todo",
      }));
    return { ...d, items: [...events, ...sessions] };
  });

  // ---- séances suggérées : poste du joueur + douleurs des 3 derniers bilans
  //      (zone lue dans la note santé). Les profils viennent de l'analyse des
  //      vidéos du catalogue (src/lib/session-profiles.ts).
  const painNotes = ((reviews ?? []) as WeeklyReview[])
    .slice(0, 3)
    .filter((r) => r.health_status === "gene" || r.health_status === "blessure")
    .map((r) => r.health_note ?? "")
    .filter(Boolean);
  const painZones = painZonesFromNotes(painNotes);
  const catalogue = (library ?? []) as LibrarySession[];
  const activeSessionIds = new Set(
    allAssignments.filter((a) => !a.removed_at).map((a) => a.session_id),
  );
  const suggestionsByPole = suggestSessions({
    position: playerRaw.position ?? null,
    painZones,
    assignedSessionIds: activeSessionIds,
    library: catalogue,
  });
  const suggestionList = [
    ...suggestionsByPole.routine.filter((x) => x.forPain),
    ...suggestionsByPole.physique.filter((x) => x.forPain),
    ...suggestionsByPole.basket.slice(0, 2),
    ...suggestionsByPole.physique.filter((x) => !x.forPain).slice(0, 2),
    ...suggestionsByPole.routine.filter((x) => !x.forPain).slice(0, 1),
  ];
  const conflicts = assignedConflicts(
    allAssignments.filter((a) => !a.removed_at).map((a) => ({ id: a.session_id, name: a.session.name })),
    painZones,
  );
  const painNote =
    painZones.length > 0
      ? `Douleur signalée au ${painZones.map((z) => ZONE_LABELS[z]).join(", au ")} dans ses derniers bilans : les séances qui chargent cette zone sont écartées, celles qui la soignent passent en tête.${
          conflicts.length > 0
            ? ` Déjà dans son programme et à mettre en pause : ${conflicts.map((c) => `${c.name} (${ZONE_LABELS[c.zone]})`).join(", ")}.`
            : ""
        }`
      : null;
  const fitById = Object.fromEntries(
    catalogue.map((sess) => [sess.id, positionFit(sess.id, playerRaw.position ?? null)]),
  );
  const avoidById = Object.fromEntries(
    [...sessionsToAvoid(catalogue.map((sess) => sess.id), painZones)].map(([sid, z]) => [sid, ZONE_LABELS[z]]),
  );

  // ---- les suggestions de Jarvis pour ce joueur dans le brief du matin
  const groupIdOfPlayer = (playerRaw.group_id as string | null) ?? null;
  const todaysBriefs = groupIdOfPlayer
    ? await getBriefsForDate(supabase, [groupIdOfPlayer], parisNow().date)
    : new Map();
  const playerRecos = (groupIdOfPlayer ? todaysBriefs.get(groupIdOfPlayer)?.recommendations ?? [] : []).filter(
    (r: BriefRecommendation) => r.playerId === id
  );

  // ---- chiffres de la tête de fiche : discipline de la dernière semaine
  //      close et sa tendance (mêmes règles que le tableau de l'accueil)
  const closedWeeks = [...allSummaries]
    .sort((a, b) => (a.week_start < b.week_start ? 1 : -1))
    .map((s) => ({ weekStart: s.week_start, done: s.done_count, planned: s.planned_count, review: false }));
  const lastClosed = closedWeeks.find((w) => w.planned > 0);
  const heroDiscipline = lastClosed ? Math.min(1, lastClosed.done / lastClosed.planned) : null;
  const heroTrend = disciplineTrend(closedWeeks);

  return (
    <>
      <Link
        href="/coach/joueurs"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-400 hover:text-navy-700"
      >
        <ChevronLeftIcon size={16} /> Joueurs
      </Link>

      {/* La tête de fiche (direction « Parquet ») : qui, son état, ses trois
          chiffres, et les gestes — appeler, demander à Jarvis, le menu ⋯. */}
      <section className="shadow-soft mb-5 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[20px] bg-white p-5 lg:px-7">
        <span className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-navy-800 to-navy-600 text-[26px] font-extrabold text-white lg:h-[84px] lg:w-[84px] lg:rounded-[24px] lg:text-[34px]">
          {`${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-extrabold uppercase leading-none tracking-wide text-navy-900 lg:text-[40px]">
            {profile?.first_name} {profile?.last_name}
          </h1>
          <p className="mt-1.5 text-sm text-navy-400">
            {[playerRaw.position, playerRaw.club, age !== null ? `${age} ans` : null, groupName]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white ${
                offer === "perf" ? "bg-[#111111]" : "bg-[#2563eb]"
              }`}
            >
              {OFFER_LABELS[offer]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                availability === "injured"
                  ? "bg-danger-soft text-danger"
                  : availability === "vacation"
                    ? "bg-warning-soft text-warning"
                    : "bg-success-soft text-success"
              }`}
            >
              {AVAILABILITY_LABELS[availability]}
              {availability !== "available" && playerRaw.availability_since
                ? ` · depuis le ${formatDateFr(playerRaw.availability_since)}`
                : ""}
            </span>
            {checkin && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                  checkin.question === "pain" && checkin.score >= 5
                    ? "bg-danger-soft text-danger"
                    : "bg-cream text-navy-500"
                }`}
              >
                {checkin.question === "energy" ? <Zap size={11} /> : <HeartPulse size={11} />}
                {checkin.question === "energy" ? "Énergie" : "Douleur"} {checkin.score}/10 ·{" "}
                {formatAgoFr(checkin.created_at)}
              </span>
            )}
            {playerRaw.kickoff_done_at && (
              <span className="rounded-full bg-cream px-2.5 py-1 text-[11.5px] font-bold text-navy-500">
                Visio de départ faite
              </span>
            )}
          </div>
        </div>
        <dl className="flex gap-7">
          <div>
            <dd className="font-display text-[34px] font-extrabold leading-none text-navy-900">
              {formatPercent(heroDiscipline)}
            </dd>
            <dt className="mt-1 text-[12px] text-navy-400">
              discipline{heroTrend === "up" ? " ↗" : heroTrend === "down" ? " ↘" : ""}
            </dt>
          </div>
          <div>
            <dd
              className={`font-display text-[34px] font-extrabold leading-none ${
                matchStats[0] ? "text-success" : "text-navy-200"
              }`}
            >
              {matchStats[0] ? matchStats[0].points : "—"}
            </dd>
            <dt className="mt-1 text-[12px] text-navy-400">pts dernier match</dt>
          </div>
          <div>
            <dd className="font-display text-[34px] font-extrabold leading-none text-navy-900">
              {weekEvents.length > 0
                ? `${Math.min(weekDone, weekEvents.length)}/${weekEvents.length}`
                : "—"}
            </dd>
            <dt className="mt-1 text-[12px] text-navy-400">cette semaine</dt>
          </div>
        </dl>
        <div className="flex items-center gap-2">
          <PlayerWhatsAppLink
            whatsappNumber={profile?.whatsapp_number}
            playerName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()}
            size="md"
          />
          <JarvisPlayerButton
            playerId={id}
            firstName={profile?.first_name ?? "ce joueur"}
            groupId={(playerRaw.group_id as string | null) ?? null}
            recos={playerRecos}
            configured={isMorningBriefConfigured()}
          />
          <RowMenu
            playerId={id}
            playerName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()}
            availability={availability}
            hideFicheLink
          />
        </div>
        {availability !== "available" && (
          <p className="w-full text-[11.5px] text-navy-400">
            Série et discipline gelées, hors moyennes et alertes.
          </p>
        )}
      </section>

      <PlayerMemoryCard memory={memory} />


      {/* Cinq onglets au lieu de onze : Messages en premier (c'est la priorité
          du service), puis ce qu'on regarde par semaine, le programme par pôle,
          les chiffres, et la fiche administrative. Rien n'a disparu — tout est
          regroupé. `?onglet=` ouvre directement le bon. */}
      <Tabs
        initialKey={onglet}
        items={[
          {
            key: "messages",
            label: "Messages",
            dot: conversationChannels.some((c) => c.hasUnread),
            content: (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Card>
                  <CardTitle>Conversation avec {profile?.first_name ?? "le joueur"}</CardTitle>
                  <ConversationPanel
                    playerId={id}
                    currentUserId={user?.id ?? ""}
                    channels={conversationChannels}
                    initialChannelKey={channelKey(initialChannelAdminId)}
                    initialMessages={conversationMessages}
                    variant="coach"
                    className="h-[460px] lg:h-[520px]"
                  />
                </Card>
                <div className="space-y-5">
                  <WeekDaysCard days={weekDetail} today={todayWeekday} playerId={id} />
                  <Card>
                    <CardTitle>Scoring</CardTitle>
                    {matchStats.length === 0 ? (
                      <p className="text-sm text-navy-400">Aucune feuille de match pour l&apos;instant.</p>
                    ) : (
                      <>
                        <ScoringChart points={[...matchStats].slice(0, 8).reverse().map((m) => m.points)} />
                        <p className="mt-2 text-[12.5px] text-navy-400">
                          {Math.min(8, matchStats.length)} derniers matchs · moyenne{" "}
                          {avgPoints !== null ? avgPoints.toFixed(1).replace(".", ",") : "—"} pts · record{" "}
                          {recordPoints ?? "—"} pts
                        </p>
                      </>
                    )}
                  </Card>
                </div>
              </div>
            ),
          },
          {
            key: "semaine",
            label: "Semaine",
            content: (
              <Tabs
                variant="sub"
                items={[
                  {
                    key: "planning",
                    label: "Planning",
                    content: (
                      // Le sous-onglet Planning sert d'abord à PLANIFIER : la semaine
                      // type arrive sans faire défiler trois cartes. La semaine en
                      // cours tient en un bandeau (jauge + 7 jours) ; focus, pointages
                      // et historique sont à un tap dans la barre dépliante — rien n'a
                      // disparu, tout a cessé de pousser.
                      <div className="space-y-4">
                        {weekEvents.length > 0 && (
                          <Section
                            title="Semaine en cours"
                            action={
                              <span className="text-sm font-extrabold tabular-nums text-navy-800">
                                {Math.min(weekDone, weekEvents.length)}/{weekEvents.length} ·{" "}
                                {formatPercent(Math.min(1, weekDone / weekEvents.length))}
                              </span>
                            }
                          >
                            <div className="h-2 overflow-hidden rounded-full bg-navy-50">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  weekDone >= weekEvents.length
                                    ? "bg-gold"
                                    : weekDone / weekEvents.length < 0.6
                                      ? "bg-danger/70"
                                      : "bg-navy-700"
                                }`}
                                style={{
                                  width: `${Math.min(1, weekDone / weekEvents.length) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-7 gap-1">
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
                          </Section>
                        )}

                        <DisclosureBar
                          items={[
                            {
                              key: "focus",
                              icon: <Target size={16} />,
                              label: "Focus",
                              count: weekFocus?.content ? 1 : 0,
                              content: (
                                <Card>
                                  <CardTitle>Focus de la semaine</CardTitle>
                                  <WeekFocusForm
                                    playerId={id}
                                    initialContent={weekFocus?.content ?? ""}
                                  />
                                </Card>
                              ),
                            },
                            {
                              key: "pointages",
                              icon: <ListChecks size={16} />,
                              label: "Pointages",
                              count: weekCompletions.length,
                              content: (
                                <Section title="Pointages de la semaine">
                                  {weekCompletions.length === 0 ? (
                                    <p className="text-sm text-navy-400">
                                      Aucun pointage cette semaine.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {weekCompletions.map((c) => (
                                        <div key={c.id} className="rounded-xl bg-navy-50 px-3 py-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-navy-800">
                                              <EventTypeIcon
                                                type={c.event_type}
                                                event={c}
                                                size={13}
                                                className="-mt-0.5 mr-1 inline"
                                                colored
                                              />
                                              {eventLabel(c)}
                                              <span className="ml-1.5 text-xs font-medium text-navy-400">
                                                {WEEKDAY_LABELS[c.weekday - 1]}{" "}
                                                {formatTime(c.event_time)}
                                              </span>
                                            </span>
                                            <Badge
                                              tone={c.status === "done" ? "success" : "danger"}
                                            >
                                              {c.status === "done" ? "Fait" : "Pas fait"}
                                            </Badge>
                                          </div>
                                          {c.comment && (
                                            <p className="mt-1 flex items-start gap-1.5 text-xs text-navy-500">
                                              <MessageCircle
                                                size={13}
                                                className="mt-0.5 shrink-0"
                                              />
                                              <span className="min-w-0">{c.comment}</span>
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Section>
                              ),
                            },
                            ...((summaries ?? []).length > 0
                              ? [
                                  {
                                    key: "historique",
                                    icon: <History size={16} />,
                                    label: "Historique",
                                    content: (
                                      <Section title="Historique des semaines">
                                        <div className="divide-y divide-navy-50">
                                          {allSummaries.slice(0, 8).map((s) => (
                                            <div
                                              key={s.id}
                                              className="flex items-center justify-between py-2"
                                            >
                                              <span className="text-sm text-navy-500">
                                                Semaine du {formatDateFr(s.week_start)}
                                              </span>
                                              <span className="text-sm font-bold text-navy-800">
                                                {s.done_count}/{s.planned_count} ·{" "}
                                                {formatPercent(
                                                  s.planned_count > 0
                                                    ? s.done_count / s.planned_count
                                                    : null,
                                                )}
                                                {s.planned_count > 0 &&
                                                  s.done_count >= s.planned_count && (
                                                    <Star
                                                      size={12}
                                                      className="-mt-0.5 ml-1 inline text-gold"
                                                    />
                                                  )}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </Section>
                                    ),
                                  },
                                ]
                              : []),
                          ]}
                        />

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500">
                              Semaine type du joueur
                            </h3>
                            <CopyWeekTemplate
                              playerId={id}
                              playerName={profile?.first_name ?? "ce joueur"}
                              otherPlayers={otherPlayers}
                            />
                          </div>
                          <PlanningEditor playerId={id} events={(events ?? []) as PlannedEvent[]} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "bilans",
                    label: "Bilans",
                    content: (
                      <div className="space-y-3">
                        {(reviews ?? []).length === 0 ? (
                          <Card>
                            <p className="text-sm text-navy-400">
                              Aucun bilan hebdomadaire pour le moment.
                            </p>
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
                              {/* Question santé (migration 0032) — absente des bilans antérieurs */}
                              {r.health_status && (
                                <p className="mt-2 text-sm text-navy-800">
                                  <span
                                    className={`font-semibold ${
                                      r.health_status === "ok" ? "text-success" : "text-danger"
                                    }`}
                                  >
                                    Santé : {REVIEW_HEALTH_LABELS[r.health_status]}
                                  </span>
                                  {r.health_note ? ` — ${r.health_note}` : ""}
                                </p>
                              )}
                              <ReviewReplyBox reviewId={r.id} initialReply={r.coach_reply} />
                            </Card>
                          ))
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "habitudes",
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
                ]}
              />
            ),
          },
          {
            key: "programme",
            label: "Programme",
            content: (
              <div className="space-y-5">
              <SessionSuggestionsCard
                playerId={id}
                firstName={profile?.first_name ?? "ce joueur"}
                position={normalizePosition(playerRaw.position ?? null)}
                painNote={painNote}
                suggestions={suggestionList}
              />
              <Tabs
                variant="sub"
                items={[
                  {
                    key: "technique",
                    label: "Technique",
                    content: (
                      <AssignedSessionsManager
                        playerId={id}
                        pole="basket"
                        fitById={fitById}
                        avoidById={avoidById}
                        assignments={allAssignments.filter((a) => a.session.pole === "basket")}
                        library={((library ?? []) as LibrarySession[]).filter(
                          (s) => s.pole === "basket",
                        )}
                        visibleNote={
                          (visibleNotes ?? []).find((n) => n.pole === "basket")?.content ?? ""
                        }
                      />
                    ),
                  },
                  {
                    key: "physique",
                    label: "Physique",
                    content: (
                      <AssignedSessionsManager
                        playerId={id}
                        pole="physique"
                        fitById={fitById}
                        avoidById={avoidById}
                        assignments={allAssignments.filter((a) => a.session.pole === "physique")}
                        library={((library ?? []) as LibrarySession[]).filter(
                          (s) => s.pole === "physique",
                        )}
                        visibleNote={
                          (visibleNotes ?? []).find((n) => n.pole === "physique")?.content ?? ""
                        }
                      />
                    ),
                  },
                  {
                    key: "routine",
                    label: "Routine",
                    content: (
                      <AssignedSessionsManager
                        playerId={id}
                        pole="routine"
                        fitById={fitById}
                        avoidById={avoidById}
                        assignments={allAssignments.filter((a) => a.session.pole === "routine")}
                        library={((library ?? []) as LibrarySession[]).filter(
                          (s) => s.pole === "routine",
                        )}
                        visibleNote={
                          (visibleNotes ?? []).find((n) => n.pole === "routine")?.content ?? ""
                        }
                      />
                    ),
                  },
                  // Hygiène : offre formation ; reste affiché pour un joueur
                  // repassé en perf tant qu'il a un historique à consulter.
                  ...(canUseHygiene(offer) || allHygieneLogs.length > 0
                    ? [
                        {
                          key: "hygiene",
                          label: "Hygiène",
                          content: (
                            <div className="space-y-5">
                              {/* activation des vidéos éducatives : offre formation
                                        uniquement (verrou RLS 0029 côté base) */}
                              {canUseHygiene(offer) && (
                                <PlayerHygieneVideosCard
                                  playerId={id}
                                  videos={(hygieneVideos ?? []) as HygieneVideo[]}
                                  initialAssignedIds={(hygieneVideoAssignments ?? []).map(
                                    (a) => a.video_id,
                                  )}
                                />
                              )}
                              <PlayerHygieneCard
                                logs={allHygieneLogs}
                                isFormation={canUseHygiene(offer)}
                              />
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              </div>
            ),
          },
          {
            key: "stats",
            label: "Stats",
            content: (
              <div className="space-y-5">
                {/* Progression gamifiée : ce que le joueur voit dans son dashboard */}
                <Card>
                  <CardTitle>Progression du joueur</CardTitle>
                  <p className="text-lg font-extrabold text-navy-900">
                    Niveau {xp.level} · {levelTitle(xp.level)}
                  </p>
                  <p className="mt-0.5 text-xs text-navy-400">
                    {xp.xp} XP au total · {xp.levelXp}/{xp.levelTarget} XP vers le niveau{" "}
                    {xp.level + 1}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-50">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{
                        width: `${Math.min(100, (xp.levelXp / xp.levelTarget) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wide text-navy-400">
                    Badges obtenus ({earnedBadges.length}/{badges.length})
                  </p>
                  {earnedBadges.length === 0 ? (
                    <p className="mt-1 text-sm text-navy-400">Aucun badge pour le moment.</p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {earnedBadges.map((b) => (
                        <span
                          key={b.key}
                          title={b.description}
                          className="rounded-full bg-navy-100 px-2.5 py-1 text-[11px] font-semibold text-navy-700"
                        >
                          <Star size={11} className="-mt-0.5 mr-1 inline text-gold" />
                          {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Radar : profil du joueur sur ses matchs (même vue que côté joueur) */}
                {matchStats.length > 0 && (
                  <Card>
                    <CardTitle>Radar du joueur</CardTitle>
                    <PlayerRadar matches={radarMatches} />
                  </Card>
                )}

                <Card>
                  <CardTitle>Statistiques match</CardTitle>
                  {matchStats.length === 0 ? (
                    <p className="text-sm text-navy-400">Aucun match saisi par le joueur.</p>
                  ) : (
                    <>
                      {/* Vue d'ensemble de la saison */}
                      <div className="mb-4 grid grid-cols-4 gap-1.5">
                        {[
                          { label: "Matchs", value: `${matchStats.length}` },
                          {
                            label: "Pts/match",
                            value: avgPoints?.toFixed(1) ?? "—",
                          },
                          {
                            label: "Min/match",
                            value: avgMinutes?.toFixed(0) ?? "—",
                          },
                          {
                            label: "Record",
                            value: recordPoints !== null ? `${recordPoints}` : "—",
                          },
                        ].map((s) => (
                          <div
                            key={s.label}
                            className="rounded-xl bg-navy-50 px-1 py-2 text-center"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                              {s.label}
                            </p>
                            <p className="mt-0.5 text-base font-extrabold text-navy-800">
                              {s.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="divide-y divide-navy-50">
                        {matchStats.map((s) => (
                          <div key={s.id} className="py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-navy-800">
                                {formatDateFr(s.match_date)}
                                <Badge
                                  tone={s.is_starter ? "navy" : "neutral"}
                                  className="ml-1.5 align-middle"
                                >
                                  {s.is_starter ? "Titulaire" : "Remplaçant"}
                                </Badge>
                              </p>
                              <p className="shrink-0 text-lg font-extrabold text-navy-800">
                                {s.points}{" "}
                                <span className="text-xs font-semibold text-navy-400">pts</span>
                              </p>
                            </div>
                            <p className="mt-0.5 text-xs text-navy-400">
                              {s.minutes} min · {s.shots_made} tir
                              {s.shots_made > 1 ? "s" : ""} réussi
                              {s.shots_made > 1 ? "s" : ""} · {s.fouls} faute
                              {s.fouls > 1 ? "s" : ""}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {[
                                {
                                  label: "2 pts int.",
                                  value: s.twos_inside_made,
                                },
                                {
                                  label: "2 pts ext.",
                                  value: s.twos_outside_made,
                                },
                                { label: "3 pts", value: s.threes_made },
                                { label: "LF", value: s.free_throws_made },
                              ].map((c) => (
                                <span
                                  key={c.label}
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    c.value > 0
                                      ? "bg-navy-100 text-navy-600"
                                      : "bg-navy-50 text-navy-300"
                                  }`}
                                >
                                  {c.label} ×{c.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: "fiche",
            label: "Fiche",
            content: (
              <div className="space-y-5">
                <div className="space-y-5">
                  <PlayerProfileForm
                    playerId={id}
                    initial={{
                      first_name: profile?.first_name ?? "",
                      last_name: profile?.last_name ?? "",
                      whatsapp_number: profile?.whatsapp_number ?? "",
                      position: playerRaw.position,
                      club: playerRaw.club,
                      birthdate: playerRaw.birthdate,
                      height_cm: playerRaw.height_cm,
                      weight_kg: playerRaw.weight_kg,
                      season_goal: playerRaw.season_goal,
                      offer,
                    }}
                  />
                  {isAdminViewer && (
                    <Card>
                      <CardTitle>Groupe</CardTitle>
                      <PlayerGroupSelect
                        playerId={id}
                        groups={groups ?? []}
                        currentGroupId={(playerRaw.group_id as string | null) ?? null}
                      />
                      <p className="mt-2 text-[11px] text-navy-400">
                        Le staff du groupe voit et suit ce joueur. Changer de groupe ne touche
                        aucune donnée.
                      </p>
                    </Card>
                  )}
                  <PlayerNotificationsCard
                    enabled={profile?.notifications_enabled ?? true}
                    deviceCount={pushDeviceCount}
                  />
                  <PlayerParentsCard
                    playerId={id}
                    parents={playerParents}
                    invitations={parentInvitations ?? []}
                  />
                  <Card>
                    <CardTitle>Objectifs mesurables</CardTitle>
                    <GoalsManager playerId={id} goals={(goals ?? []) as PlayerGoal[]} />
                  </Card>
                </div>

                <Section title="Notes privées">
                  <CoachNotesPanel playerId={id} notes={(notes ?? []) as CoachNote[]} />
                </Section>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
