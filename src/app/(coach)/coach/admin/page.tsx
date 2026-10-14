import { redirect } from "next/navigation";
import { Megaphone, Sparkles, UserPlus, UserRoundPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import {
  averageDiscipline,
  getHealthByPlayer,
  getPlayersWithDiscipline,
  type PlayerDiscipline,
} from "@/lib/coach-data";
import { getSessionCoverage, PAIN_ALERT_DAYS, PAIN_ALERT_SCORE } from "@/lib/alerts";
import { getStaffUnreadPlayerIds } from "@/lib/conversations";
import { formatPercent } from "@/lib/discipline";
import { AVAILABILITY_LABELS, INBOX_SCAN_LIMIT, LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { OFFER_LABELS } from "@/lib/offers";
import { addDays, currentWeekStart, formatAgoFr } from "@/lib/dates";
import type { PlayerOffer } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatStrip } from "@/components/ui/StatStrip";
import { Section } from "@/components/ui/Section";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { DisclosureBar } from "@/components/ui/DisclosureBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateCoachButton } from "./CreateCoachButton";
import { AnnouncementsManager } from "./AnnouncementsManager";
import { GroupsManager } from "./GroupsManager";
import { MorningBriefPanel } from "./MorningBriefPanel";
import { CoachInvitations, type CoachChoice } from "@/components/coach/CoachInvitations";
import { getGroupsWithStaff } from "@/lib/groups";
import { getLastBriefDates, isMorningBriefConfigured } from "@/lib/briefs";
import type { Announcement, Invitation, StaffProfile } from "@/lib/types";

export const metadata = { title: "Admin — VPF" };
export const dynamic = "force-dynamic";

/**
 * Au-delà de ce délai, un message de joueur ou de parent resté sans réponse
 * du staff compte comme « sans réponse » dans le travail d'un coach.
 */
const REPLY_DELAY_HOURS = 24;

interface StaffRow {
  id: string;
  name: string;
  isAdmin: boolean;
  playersCount: number;
  perfCount: number;
  formationCount: number;
  discipline: number | null;
  /** bilans de la semaine reçus / attendus (joueurs disponibles) */
  reviewsReceived: number;
  reviewsExpected: number;
  /** bilans des deux dernières semaines auxquels le coach a répondu / reçus */
  repliesDone: number;
  repliesExpected: number;
  /** dernier message écrit par ce membre du staff, tous fils confondus */
  lastActiveAt: string | null;
  awaitingReplies: number;
  painAlerts: number;
  emptyPlannings: number;
  noProgram: number;
  lowDiscipline: number;
  alertCount: number;
}

/** Le dernier message du fil Global d'un joueur : qui, quand. */
interface LastGlobalMessage {
  senderId: string | null;
  at: string;
}

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

/**
 * Onglet Admin : le regard des deux admins sur l'ensemble du service.
 *
 * Trois étages : le tableau d'affichage du club (messages en attente, joueurs
 * par offre, coachs, discipline, bilans), **les coachs et leur travail** (ce
 * qu'ils rendent : bilans reçus et répondus, fils sans réponse, joueurs sans
 * programme, dernière activité — ceux qui demandent l'attention en premier),
 * et **les joueurs par offre** (Perf / Formation), les plus en difficulté en
 * tête. Les gestes rares — annonces, nouveau coach, nouveau joueur (avec le
 * choix du coach référent) — sont derrière trois icônes.
 *
 * Tout ici couvre le club entier : c'est le seul écran, avec « À savoir »,
 * qui ne filtre pas sur `coach_id`. Réservé aux admins (redirection sinon).
 */
export default async function AdminPage() {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") redirect("/coach");

  const supabase = await createClient();
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const now = new Date();

  // Tout le staff encadre des joueurs : les coachs comme les deux admins
  const [{ data: staff }, players, { data: announcements }, groups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("role", ["coach", "admin"])
      .order("first_name"),
    getPlayersWithDiscipline(supabase),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    getGroupsWithStaff(supabase),
  ]);
  const playersPerGroup: Record<string, number> = {};
  for (const p of players) {
    if (p.group_id) playersPerGroup[p.group_id] = (playersPerGroup[p.group_id] ?? 0) + 1;
  }
  const lastBriefDates = await getLastBriefDates(
    supabase,
    groups.map((g) => g.id)
  );

  const playerIds = players.map((p) => p.id);
  const staffIds = new Set((staff ?? []).map((s) => s.id));

  const [
    health,
    coverage,
    unreadPlayerIds,
    { data: reviews },
    { data: messages },
    { data: invitations },
  ] = await Promise.all([
      getHealthByPlayer(supabase, playerIds),
      getSessionCoverage(supabase, playerIds),
      getStaffUnreadPlayerIds(supabase, profile.id, playerIds),
      playerIds.length === 0
        ? { data: [] }
        : supabase
            .from("weekly_reviews")
            .select("player_id, week_start, coach_reply")
            .in("week_start", [weekStart, prevWeekStart])
            .in("player_id", playerIds),
      // un seul balayage borné des messages du club (même borne que les
      // boîtes de réception) : dernier message de chaque fil Global, dernière
      // activité de chaque membre du staff
      playerIds.length === 0
        ? { data: [] }
        : supabase
            .from("conversation_messages")
            .select("player_id, channel_admin_id, sender_id, created_at")
            .in("player_id", playerIds)
            // un rappel automatique « VPF » (0043) n'est pas un échange : il
            // ne doit ni masquer un fil sans réponse ni consommer la borne
            .eq("is_system", false)
            .order("created_at", { ascending: false })
            .limit(INBOX_SCAN_LIMIT),
      // les invitations que J'ai créées, quel que soit le coach visé
      supabase
        .from("invitations")
        .select("*")
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false }),
    ]);

  // noms des joueurs inscrits via ces invitations
  const usedByIds = ((invitations ?? []) as Invitation[])
    .map((i) => i.used_by)
    .filter((v): v is string => Boolean(v));
  const { data: usedByProfiles } =
    usedByIds.length === 0
      ? { data: [] }
      : await supabase.from("profiles").select("id, first_name, last_name").in("id", usedByIds);
  const usedByNames = new Map(
    (usedByProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  );
  const invitationRows = ((invitations ?? []) as Invitation[]).map((inv) => ({
    ...inv,
    used_by_name: inv.used_by ? (usedByNames.get(inv.used_by) ?? "Joueur") : null,
  }));
  // coachs référents possibles : moi en tête, puis les collègues A → Z
  const coachChoices: CoachChoice[] = (staff ?? [])
    .map((s) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`.trim() || "(profil incomplet)",
      isMe: s.id === profile.id,
    }))
    .sort((a, b) => (a.isMe === b.isMe ? a.name.localeCompare(b.name, "fr") : a.isMe ? -1 : 1))
    .map(({ id, name, isMe }) => ({ id, name: isMe ? `${name} (moi)` : name }));

  // ---- messages : du plus récent au plus ancien, le premier vu est le dernier
  const lastGlobalByPlayer = new Map<string, LastGlobalMessage>();
  const lastActiveByStaff = new Map<string, string>();
  for (const m of messages ?? []) {
    if (m.channel_admin_id === null && !lastGlobalByPlayer.has(m.player_id)) {
      lastGlobalByPlayer.set(m.player_id, { senderId: m.sender_id, at: m.created_at });
    }
    if (m.sender_id && staffIds.has(m.sender_id) && !lastActiveByStaff.has(m.sender_id)) {
      lastActiveByStaff.set(m.sender_id, m.created_at);
    }
  }
  const isAwaitingReply = (playerId: string): boolean => {
    const last = lastGlobalByPlayer.get(playerId);
    if (!last || !last.senderId || staffIds.has(last.senderId)) return false;
    return hoursSince(last.at, now) >= REPLY_DELAY_HOURS;
  };

  // ---- bilans : reçus cette semaine, répondus sur deux semaines
  const withReviewThisWeek = new Set<string>();
  const receivedTwoWeeks = new Map<string, number>();
  const repliedTwoWeeks = new Map<string, number>();
  for (const r of reviews ?? []) {
    if (r.week_start === weekStart) withReviewThisWeek.add(r.player_id);
    receivedTwoWeeks.set(r.player_id, (receivedTwoWeeks.get(r.player_id) ?? 0) + 1);
    if (r.coach_reply && r.coach_reply.trim()) {
      repliedTwoWeeks.set(r.player_id, (repliedTwoWeeks.get(r.player_id) ?? 0) + 1);
    }
  }

  // ---- santé : douleur >= 5 sur un check-in récent
  const hasPainAlert = (playerId: string): boolean => {
    const pain = health.get(playerId)?.pain;
    return Boolean(
      pain && pain.score >= PAIN_ALERT_SCORE && hoursSince(pain.at, now) <= PAIN_ALERT_DAYS * 24
    );
  };
  const hasNoProgram = (playerId: string): boolean => {
    const c = coverage.get(playerId);
    return Boolean(c && (c.byPole.basket === 0 || c.byPole.physique === 0));
  };

  // ---- les coachs et leur travail
  const rows: StaffRow[] = (staff ?? []).map((s) => {
    const own = players.filter((p) => p.coach_id === s.id);
    const available = own.filter((p) => p.availability === "available");
    const awaitingReplies = own.filter((p) => isAwaitingReply(p.id)).length;
    const painAlerts = own.filter((p) => hasPainAlert(p.id)).length;
    const emptyPlannings = available.filter((p) => p.planningEmpty).length;
    const noProgram = available.filter((p) => hasNoProgram(p.id)).length;
    const lowDiscipline = available.filter(
      (p) => p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
    ).length;
    return {
      id: s.id,
      name: `${s.first_name} ${s.last_name}`.trim() || "(profil incomplet)",
      isAdmin: s.role === "admin",
      playersCount: own.length,
      perfCount: own.filter((p) => p.offer === "perf").length,
      formationCount: own.filter((p) => p.offer === "formation").length,
      discipline: averageDiscipline(own),
      reviewsReceived: available.filter((p) => withReviewThisWeek.has(p.id)).length,
      reviewsExpected: available.length,
      repliesDone: own.reduce((sum, p) => sum + (repliedTwoWeeks.get(p.id) ?? 0), 0),
      repliesExpected: own.reduce((sum, p) => sum + (receivedTwoWeeks.get(p.id) ?? 0), 0),
      lastActiveAt: lastActiveByStaff.get(s.id) ?? null,
      awaitingReplies,
      painAlerts,
      emptyPlannings,
      noProgram,
      lowDiscipline,
      alertCount: awaitingReplies + painAlerts + emptyPlannings + noProgram + lowDiscipline,
    };
  });
  // les coachs qui demandent l'attention remontent en premier
  rows.sort((a, b) => b.alertCount - a.alertCount || a.name.localeCompare(b.name, "fr"));

  // ---- le club en chiffres
  const availablePlayers = players.filter((p) => p.availability === "available");
  const perfPlayers = players.filter((p) => p.offer === "perf");
  const formationPlayers = players.filter((p) => p.offer === "formation");
  const clubDiscipline = averageDiscipline(players);
  const reviewsReceived = availablePlayers.filter((p) => withReviewThisWeek.has(p.id)).length;
  const unreadCount = players.filter((p) => unreadPlayerIds.has(p.id)).length;
  const coachFirstName = new Map((staff ?? []).map((s) => [s.id, s.first_name as string]));

  /** Les joueurs d'une offre, les plus en difficulté en tête. */
  function playersOfOffer(offer: PlayerOffer) {
    const list = players.filter((p) => p.offer === offer);
    const sorted = [...list].sort((a, b) => {
      const ad = a.discipline ?? Number.POSITIVE_INFINITY;
      const bd = b.discipline ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.first_name.localeCompare(b.first_name, "fr");
    });
    const available = list.filter((p) => p.availability === "available");
    const received = available.filter((p) => withReviewThisWeek.has(p.id)).length;
    return { sorted, discipline: averageDiscipline(list), received, expected: available.length };
  }

  function PlayerRow({ p }: { p: PlayerDiscipline }) {
    const pain = health.get(p.id)?.pain;
    const details = [
      `Coach ${coachFirstName.get(p.coach_id) ?? "?"}`,
      p.availability === "available"
        ? withReviewThisWeek.has(p.id)
          ? "Bilan reçu"
          : "Bilan manquant"
        : null,
    ].filter(Boolean);
    const alerts = [
      unreadPlayerIds.has(p.id) ? "Message en attente" : null,
      isAwaitingReply(p.id) ? "Sans réponse du coach" : null,
      hasPainAlert(p.id) && pain ? `Douleur ${pain.score}/10` : null,
      p.availability === "available" && p.planningEmpty ? "Planning vide" : null,
      p.availability === "available" && hasNoProgram(p.id) ? "Programme incomplet" : null,
    ].filter(Boolean);
    const low = p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD;
    return (
      <Row
        href={`/coach/joueurs/${p.id}`}
        dot={alerts.length > 0}
        emphasis={alerts.length > 0}
        wrap
        title={
          <span className="flex items-center gap-1.5">
            <span className="truncate">
              {p.first_name} {p.last_name}
            </span>
            {p.availability !== "available" && (
              <Badge tone={p.availability === "injured" ? "danger" : "neutral"}>
                {AVAILABILITY_LABELS[p.availability]}
              </Badge>
            )}
          </span>
        }
        subtitle={
          <>
            {details.join(" · ")}
            {alerts.length > 0 && (
              <span className="font-semibold text-danger"> · {alerts.join(" · ")}</span>
            )}
          </>
        }
        right={
          <span
            className={`text-sm font-extrabold tabular-nums ${
              p.discipline === null ? "text-navy-300" : low ? "text-danger" : "text-navy-900"
            }`}
          >
            {formatPercent(p.discipline)}
          </span>
        }
      />
    );
  }

  function OfferPanel({ offer }: { offer: PlayerOffer }) {
    const { sorted, discipline, received, expected } = playersOfOffer(offer);
    if (sorted.length === 0) {
      return <EmptyState>Aucun joueur en offre {OFFER_LABELS[offer]} pour le moment.</EmptyState>;
    }
    return (
      <Section
        title={`${sorted.length} joueur${sorted.length > 1 ? "s" : ""}`}
        action={
          <span className="text-[11px] text-navy-400">
            Discipline {formatPercent(discipline)} · Bilans {received}/{expected}
          </span>
        }
      >
        <div>
          {sorted.map((p) => (
            <PlayerRow key={p.id} p={p} />
          ))}
        </div>
      </Section>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle={
          rows.some((r) => r.alertCount > 0)
            ? `${rows.reduce((s, r) => s + r.alertCount, 0)} point${
                rows.reduce((s, r) => s + r.alertCount, 0) > 1 ? "s" : ""
              } d'attention dans le club.`
            : "Le service en un coup d'œil."
        }
      />

      <StatStrip
        items={[
          {
            label: "Messages",
            value: `${unreadCount}`,
            hint: unreadCount > 0 ? "à lire" : "tout est lu",
            tone: unreadCount > 0 ? "danger" : "default",
          },
          {
            label: "Joueurs",
            value: `${players.length}`,
            hint: `${perfPlayers.length} perf · ${formationPlayers.length} form.`,
          },
          { label: "Coachs", value: `${rows.length}` },
          {
            label: "Discipline",
            value: formatPercent(clubDiscipline),
            hint: "moyenne club",
            tone:
              clubDiscipline !== null && clubDiscipline < LOW_DISCIPLINE_THRESHOLD
                ? "warning"
                : "default",
          },
          {
            label: "Bilans",
            value: `${reviewsReceived}/${availablePlayers.length}`,
            hint: "cette semaine",
          },
        ]}
      />

      <DisclosureBar
        className="mt-4"
        items={[
          {
            key: "groupes",
            icon: <Users size={16} />,
            label: "Groupes",
            count: groups.length,
            content: (
              <GroupsManager
                groups={groups}
                staff={(staff ?? []) as StaffProfile[]}
                playerCount={playersPerGroup}
              />
            ),
          },
          {
            key: "claude",
            icon: <Sparkles size={16} />,
            label: "Jarvis du matin",
            content: (
              <MorningBriefPanel
                configured={isMorningBriefConfigured()}
                groups={groups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  lastDate: lastBriefDates.get(g.id) ?? null,
                }))}
              />
            ),
          },
          {
            key: "annonces",
            icon: <Megaphone size={16} />,
            label: "Annonces",
            count: (announcements ?? []).length,
            content: <AnnouncementsManager announcements={(announcements ?? []) as Announcement[]} />,
          },
          {
            key: "coach",
            icon: <UserPlus size={16} />,
            label: "Nouveau coach",
            content: <CreateCoachButton />,
          },
          {
            key: "joueur",
            icon: <UserRoundPlus size={16} />,
            label: "Nouveau joueur",
            count: invitationRows.filter((i) => !i.used_at).length,
            content: (
              <CoachInvitations
                coachId={profile.id}
                coaches={coachChoices}
                invitations={invitationRows}
                appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
                title="Inviter un joueur"
              />
            ),
          },
        ]}
      />

      {/* ---- Les coachs et leur travail : ce que chacun rend, ceux qui
          demandent l'attention en premier. La ligne ouvre la fiche coach
          (joueurs, invitations, réaffectation, archivage). ---- */}
      <Section className="mt-6" title="Coachs et leur travail">
        {rows.length === 0 ? (
          <EmptyState>Aucun coach pour le moment.</EmptyState>
        ) : (
          <div>
            {rows.map((r) => {
              const details = [
                `${r.playersCount} joueur${r.playersCount > 1 ? "s" : ""}${
                  r.playersCount > 0 ? ` (${r.perfCount} perf · ${r.formationCount} form.)` : ""
                }`,
                `Discipline ${formatPercent(r.discipline)}`,
                `Bilans ${r.reviewsReceived}/${r.reviewsExpected}`,
                r.repliesExpected > 0 ? `Réponses ${r.repliesDone}/${r.repliesExpected}` : null,
                r.lastActiveAt ? `Actif ${formatAgoFr(r.lastActiveAt)}` : "Aucun message écrit",
              ].filter(Boolean);
              const alerts = [
                r.awaitingReplies > 0
                  ? `${r.awaitingReplies} fil${r.awaitingReplies > 1 ? "s" : ""} sans réponse`
                  : null,
                r.painAlerts > 0 ? `${r.painAlerts} douleur${r.painAlerts > 1 ? "s" : ""}` : null,
                r.emptyPlannings > 0
                  ? `${r.emptyPlannings} planning${r.emptyPlannings > 1 ? "s" : ""} vide${r.emptyPlannings > 1 ? "s" : ""}`
                  : null,
                r.noProgram > 0
                  ? `${r.noProgram} programme${r.noProgram > 1 ? "s" : ""} incomplet${r.noProgram > 1 ? "s" : ""}`
                  : null,
                r.lowDiscipline > 0
                  ? `${r.lowDiscipline} discipline${r.lowDiscipline > 1 ? "s" : ""} faible${r.lowDiscipline > 1 ? "s" : ""}`
                  : null,
              ].filter(Boolean);

              return (
                <Row
                  key={r.id}
                  href={`/coach/club/${r.id}`}
                  dot={r.alertCount > 0}
                  emphasis={r.alertCount > 0}
                  wrap
                  title={
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{r.name}</span>
                      {r.isAdmin && <Badge tone="navy">Admin</Badge>}
                    </span>
                  }
                  subtitle={
                    <>
                      {details.join(" · ")}
                      {alerts.length > 0 && (
                        <span className="block font-semibold text-danger">{alerts.join(" · ")}</span>
                      )}
                    </>
                  }
                  right={
                    r.alertCount > 0 ? <Badge tone="danger">{r.alertCount}</Badge> : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* ---- Les joueurs par offre : le regard sur VPF Perf et VPF
          Formation, les plus en difficulté en tête. ---- */}
      <div className="mt-6">
        <Tabs
          items={[
            {
              key: "perf",
              label: `Perf (${perfPlayers.length})`,
              content: <OfferPanel offer="perf" />,
            },
            {
              key: "formation",
              label: `Formation (${formationPlayers.length})`,
              content: <OfferPanel offer="formation" />,
            },
          ]}
        />
      </div>
    </>
  );
}
