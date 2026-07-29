import Image from "next/image";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { addDays, currentWeekStart, formatDateFr, isoWeekNumber, parisNow } from "@/lib/dates";
import { activeDayStreak } from "@/lib/discipline";
import { canUseHygiene, toOffer } from "@/lib/offers";
import { HYGIENE_MISSION_START } from "@/lib/hygiene";
import { PlanningView } from "@/components/planning/PlanningView";
import { WeeklyReviewLauncher } from "@/components/planning/WeeklyReviewLauncher";
import { MatchSheetLauncher } from "@/components/planning/MatchSheetLauncher";
import { StreakBanner } from "@/components/planning/StreakBanner";
import { Overline, DisplayTitle, DoubleRule } from "@/components/editorial/primitives";
import { DiscordIcon } from "@/components/icons";
import { DISCORD_INVITE_URL } from "@/lib/constants";
import { computeMatchRecords } from "@/lib/gamification";
import type { DayOutcome } from "@/components/planning/DisciplineCalendar";
import type {
  EventCompletion,
  HygieneLog,
  MatchStat,
  PlannedEvent,
  ReviewHealthStatus,
} from "@/lib/types";

export const metadata = { title: "Planning — VPF" };
export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const now = parisNow();

  // Une seule vague de requêtes parallèles : chaque batch séquentiel ajoute
  // un aller-retour complet vers Supabase au temps de chargement de l'onglet.
  const [
    { data: events },
    { data: completions },
    { data: allCompletions },
    { data: coachRow },
    { data: lastReview },
    { data: coachFocusRow },
    { data: thisWeekReview },
    { data: matchStats },
    { data: hygieneToday },
    { data: hygieneDates },
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
      .from("players")
      .select(
        "availability, offer, coach:profiles!players_coach_id_fkey(first_name, last_name, whatsapp_number)"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("weekly_reviews")
      .select("to_improve, coach_reply, week_start")
      .eq("player_id", user.id)
      .eq("week_start", prevWeekStart)
      .maybeSingle(),
    supabase.from("coach_focus").select("content").eq("player_id", user.id).maybeSingle(),
    supabase
      .from("weekly_reviews")
      .select("went_well, to_improve, health_status, health_note, coach_reply, week_start")
      .eq("player_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
    supabase
      .from("match_stats")
      .select("*")
      .eq("player_id", user.id)
      .order("match_date", { ascending: false }),
    // mission du jour (offre formation) : la saisie d'hygiène d'aujourd'hui,
    // qui pré-remplit le formulaire. En offre perf la RLS (0026) ne renvoie
    // rien ; la mission est de toute façon écartée plus bas.
    supabase
      .from("hygiene_logs")
      .select("*")
      .eq("player_id", user.id)
      .eq("log_date", now.date)
      .maybeSingle(),
    // jours déjà notés (dates seules) : la frise et le calendrier de
    // discipline les comptent comme une tâche accomplie de la journée
    supabase
      .from("hygiene_logs")
      .select("log_date")
      .eq("player_id", user.id)
      .gte("log_date", HYGIENE_MISSION_START),
  ]);

  // Contact coach : gardé pour l'intitulé du bouton (l'équipe échange sur Discord)
  const coach = coachRow?.coach
    ? ((Array.isArray(coachRow.coach) ? coachRow.coach[0] : coachRow.coach) as {
        first_name: string;
        last_name: string;
        whatsapp_number: string;
      } | null)
    : null;

  // série de jours actifs : au moins un pointage "done" dans la journée — la
  // chaîne ne casse que sur un jour où RIEN n'a été fait (matérialisé en
  // not_done par le cron dès la nuit suivante)
  const streak = activeDayStreak(allCompletions ?? [], now.date);

  // série que le joueur ATTEINT en bouclant aujourd'hui = série jusqu'à hier + 1.
  // Robuste au décalage : ne dépend pas de l'état de la journée en cours (donc
  // pas de double comptage si on dé-coche puis re-coche la dernière tâche).
  const streakOnComplete = activeDayStreak(allCompletions ?? [], addDays(now.date, -1)) + 1;

  // Offre formation : la mission d'hygiène est due chaque jour depuis son
  // ouverture et compte comme une tâche de la journée (frise + calendrier).
  const hasMission = canUseHygiene(toOffer(coachRow?.offer));
  const notedDates = (hygieneDates ?? []).map((row) => row.log_date as string);

  // historique jour par jour (calendrier de discipline) : complet quand tous
  // les pointages du jour sont "done", partiel dès qu'un seul l'est
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

    // la mission pèse dans chaque journée depuis HYGIENE_MISSION_START —
    // jamais avant, sinon les journées déjà classées « complètes » se
    // retrouveraient rétroactivement partielles
    if (hasMission) {
      const noted = new Set(notedDates);
      for (let date = HYGIENE_MISSION_START; date <= now.date; date = addDays(date, 1)) {
        const entry = byDate.get(date) ?? { done: 0, total: 0 };
        entry.total++;
        if (noted.has(date)) entry.done++;
        byDate.set(date, entry);
      }
    }
    for (const [date, e] of byDate) {
      // la journée en cours n'est pas terminée : pas de « manqué » prématuré
      if (date === now.date && e.done === 0) continue;
      dayHistory[date] = e.done === e.total ? "complete" : e.done > 0 ? "partial" : "missed";
    }
  }

  // Feuille de match + bilan déplacés dans le planning (pastilles en bas). Un
  // « ? » jaune apparaît le week-end (samedi/dimanche) tant que NI le bilan NI
  // une feuille de match de la semaine n'ont été remplis — il s'arrête dès que
  // l'un des deux l'est.
  const records = computeMatchRecords((matchStats ?? []) as MatchStat[]);
  const hasReview = Boolean(thisWeekReview);
  // état du bilan de la semaine : partagé par la pastille du bas et le
  // rendez-vous fixe du dimanche 18 h dans le planning
  const weeklyReview = {
    hasReview,
    initialWentWell: thisWeekReview?.went_well ?? "",
    initialToImprove: thisWeekReview?.to_improve ?? "",
    initialHealthStatus: (thisWeekReview?.health_status ?? "") as ReviewHealthStatus,
    initialHealthNote: thisWeekReview?.health_note ?? "",
  };
  const hasMatchThisWeek = (matchStats ?? []).some((m) => m.match_date >= weekStart);
  const isWeekend = now.isoWeekday >= 6;
  const remind = isWeekend && !hasReview && !hasMatchThisWeek;
  // Réponse du coach au bilan : celle de la semaine en cours en priorité,
  // sinon celle de la semaine passée (le coach répond souvent lundi/mardi)
  const coachReply = thisWeekReview?.coach_reply?.trim()
    ? { text: thisWeekReview.coach_reply.trim(), weekStart: thisWeekReview.week_start }
    : lastReview?.coach_reply?.trim()
      ? { text: lastReview.coach_reply.trim(), weekStart: lastReview.week_start }
      : null;

  const coachFocus = coachFocusRow?.content?.trim() || null;
  const playerFocus = lastReview?.to_improve?.trim() || null;
  const focus = coachFocus
    ? { text: coachFocus, source: "coach" as const }
    : playerFocus
      ? { text: playerFocus, source: "player" as const }
      : null;

  const weekNo = String(isoWeekNumber(weekStart)).padStart(2, "0");

  // Mission journalière : noter son hygiène de vie, tous les soirs. Réservée à
  // l'offre formation (src/lib/offers.ts) — un joueur perf ne la voit jamais.
  const hygieneMission = hasMission
    ? {
        dateLabel: formatDateFr(now.date),
        log: (hygieneToday ?? null) as HygieneLog | null,
        notedDates,
      }
    : null;

  return (
    <>
      {/* Header rétro : surtitre semaine → titre varsity → filet double.
          Logo du club dans l'angle supérieur droit : blend multiply pour fondre
          son fond blanc dans le papier + légère sépia pour la teinte rétro. */}
      <div className="relative">
        <Overline>Planning · Semaine {weekNo}</Overline>
        <DisplayTitle className="mt-2 text-[42px]">Ma Semaine</DisplayTitle>
        <Image
          src="/vpf-embleme-v2.png"
          alt="Logo VPF"
          width={53}
          height={80}
          className="pointer-events-none absolute -top-1 right-0 h-20 w-auto select-none"
          style={{ mixBlendMode: "multiply" }}
        />
      </div>

      <DoubleRule className="mt-3" />

      {/* Indisponibilité (posée par le coach) : la série et la discipline sont
          gelées — pas de rappels ni de jours comptés ratés pendant l'absence */}
      {coachRow?.availability && coachRow.availability !== "available" && (
        <div className="mt-5 rounded-md border-2 border-ink bg-tan/50 px-4 py-3">
          <p className="ed-overline">
            {coachRow.availability === "injured" ? "Mode blessé" : "Mode vacances"}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">
            {coachRow.availability === "injured"
              ? "Ta série et ta discipline sont gelées le temps de te soigner. Récupère bien — le terrain t'attend. 💪"
              : "Ta série et ta discipline sont gelées pendant tes vacances. Profite, et reviens en forme. ☀️"}
          </p>
        </div>
      )}

      {/* Série de jours complets : fondu dans le papier. Scoreboard deux tons —
          éclair + chiffre rouge brique (le héros), « JOURS DE SUITE » navy,
          « DE PROGRESSION » en surtitre mono rouge pour la respiration. */}
      <StreakBanner streak={streak} storageScope={user.id} />
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
        dayHistory={dayHistory}
        today={now.date}
        weekStart={weekStart}
        todayWeekday={now.isoWeekday}
        nowMinutes={now.minutesOfDay}
        focus={focus}
        streakOnComplete={streakOnComplete}
        hygieneMission={hygieneMission}
        weeklyReview={weeklyReview}
      />

      {/* Réponse du coach au bilan hebdo : carte éditoriale sous le planning */}
      {coachReply && (
        <div className="mt-8 rounded-md border-2 border-ink bg-tan/50 px-4 py-3">
          <p className="ed-overline">
            Réponse du coach · bilan de la semaine du {formatDateFr(coachReply.weekStart)}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{coachReply.text}</p>
        </div>
      )}

      {/* Feuille de match + bilan de la semaine : pastilles en bas à gauche.
          « ? » jaune de rappel le week-end tant que ni l'un ni l'autre n'est rempli. */}
      <div className="mt-8 flex flex-wrap items-center gap-2.5">
        <MatchSheetLauncher records={records} hasMatch={hasMatchThisWeek} remind={remind} />
        <WeeklyReviewLauncher review={weeklyReview} remind={remind} />
      </div>

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
