import { redirect } from "next/navigation";
import { Megaphone, Sparkles, UserPlus, UserRoundPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import {
  averageDiscipline,
  getHealthByPlayer,
  getPlayersWithDiscipline,
} from "@/lib/coach-data";
import { getSessionCoverage, PAIN_ALERT_DAYS, PAIN_ALERT_SCORE } from "@/lib/alerts";
import { INBOX_SCAN_LIMIT, LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { addDays, currentWeekStart, formatAgoFr } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateCoachButton } from "./CreateCoachButton";
import { AnnouncementsManager } from "./AnnouncementsManager";
import { AdminTools } from "./AdminTools";
import { GroupBoard, type BoardGroup, type BoardStaff } from "./GroupBoard";
import { MorningBriefPanel } from "./MorningBriefPanel";
import { CoachInvitations, type CoachChoice } from "@/components/coach/CoachInvitations";
import { getGroupsWithStaff } from "@/lib/groups";
import { getLastBriefDates, isMorningBriefConfigured } from "@/lib/briefs";
import type { Announcement, Invitation } from "@/lib/types";

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
 * Onglet Admin : l'organisation du service, sur un écran, sans défilement.
 *
 * En tête, la barre d'outils (Annonces, Jarvis du matin, Nouveau coach,
 * Nouveau joueur), chaque outil ouvert dans un volet. Dessous, le tableau des
 * groupes (`GroupBoard`) : une colonne par groupe avec son staff — et le
 * travail de chacun (bilans, réponses, fils sans réponse, programmes
 * incomplets…) — puis ses joueurs, retirables en trois clics ; la dernière
 * colonne crée le groupe suivant.
 *
 * Tout ici couvre le club entier. Réservé aux admins (redirection sinon).
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
  const lastBriefDates = await getLastBriefDates(
    supabase,
    groups.map((g) => g.id)
  );

  const playerIds = players.map((p) => p.id);
  const staffIds = new Set((staff ?? []).map((s) => s.id));

  const [
    health,
    coverage,
    { data: reviews },
    { data: messages },
    { data: invitations },
  ] = await Promise.all([
      getHealthByPlayer(supabase, playerIds),
      getSessionCoverage(supabase, playerIds),
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
  // ---- le tableau des groupes
  const boardStaff: BoardStaff[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isAdmin: r.isAdmin,
    summary: [
      `${r.playersCount} référé${r.playersCount > 1 ? "s" : ""}`,
      r.playersCount > 0 ? `bilans ${r.reviewsReceived}/${r.reviewsExpected}` : null,
      r.repliesExpected > 0 ? `réponses ${r.repliesDone}/${r.repliesExpected}` : null,
      r.lastActiveAt ? `actif ${formatAgoFr(r.lastActiveAt)}` : "aucun message",
    ]
      .filter(Boolean)
      .join(" · "),
    alerts: [
      r.awaitingReplies > 0 ? `${r.awaitingReplies} sans réponse` : null,
      r.painAlerts > 0 ? `${r.painAlerts} douleur${r.painAlerts > 1 ? "s" : ""}` : null,
      r.emptyPlannings > 0 ? `${r.emptyPlannings} planning${r.emptyPlannings > 1 ? "s" : ""} vide${r.emptyPlannings > 1 ? "s" : ""}` : null,
      r.noProgram > 0 ? `${r.noProgram} programme${r.noProgram > 1 ? "s" : ""} incomplet${r.noProgram > 1 ? "s" : ""}` : null,
      r.lowDiscipline > 0 ? `${r.lowDiscipline} discipline${r.lowDiscipline > 1 ? "s" : ""} faible${r.lowDiscipline > 1 ? "s" : ""}` : null,
    ].filter((x): x is string => Boolean(x)),
  }));
  boardStaff.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const boardGroups: BoardGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    staffIds: g.staff.map((m) => m.id),
    referentIds: [
      ...new Set(
        players
          .filter((p) => p.group_id === g.id && p.coach_id)
          .map((p) => p.coach_id as string),
      ),
    ],
    players: players
      .filter((p) => p.group_id === g.id)
      .map((p) => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        offer: p.offer,
        availability: p.availability,
        discipline: p.discipline,
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName, "fr")),
  }));

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-4.75rem)]">
      <PageHeader
        title="Admin"
        subtitle={`${groups.length} groupe${groups.length > 1 ? "s" : ""} · ${players.length} joueur${players.length > 1 ? "s" : ""} actif${players.length > 1 ? "s" : ""} · ${boardStaff.length} membres du staff`}
      />

      <div className="mb-4">
        <AdminTools
          tools={[
            {
              key: "annonces",
              icon: <Megaphone size={16} />,
              label: "Annonces",
              count: (announcements ?? []).length,
              content: <AnnouncementsManager announcements={(announcements ?? []) as Announcement[]} />,
            },
            {
              key: "jarvis",
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
      </div>

      <GroupBoard groups={boardGroups} staff={boardStaff} />
    </div>
  );
}
