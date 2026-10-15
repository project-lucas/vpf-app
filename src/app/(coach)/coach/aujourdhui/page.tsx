import { redirect } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getNavRole } from "@/lib/auth";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { getMyPlayerIds } from "@/lib/conversations";
import { getHomeRows } from "@/lib/staff-overview";
import { getDrafts, formatMonthFr, TASK_MINUTES } from "@/lib/jarvis-drafts";
import { getProgramProposals } from "@/lib/program-proposals";
import { isMorningBriefConfigured } from "@/lib/briefs";
import { channelKey } from "@/lib/constants";
import { currentWeekStart, formatWeekRangeFr, parisNow } from "@/lib/dates";
import { currentMonth } from "@/lib/jarvis-drafts";
import { TodayQueue } from "./TodayQueue";
import type { QueueData, QueuePlayer } from "./types";

export const metadata = { title: "Jarvis — VPF" };
export const dynamic = "force-dynamic";
// « Préparer maintenant » (server action de cette page) appelle le modèle
export const maxDuration = 60;

/**
 * La file « Aujourd'hui » : tout ce qui demande un geste du staff, pour tout
 * le périmètre d'un coup (plus un groupe à la fois), triée par urgence et
 * chiffrée en minutes. Jarvis a préparé le travail — réponses aux bilans,
 * visios pour les joueurs qui décrochent, rapports du mois aux parents ; les
 * programmes viennent du moteur de suggestions. Le staff valide, corrige ou
 * passe.
 *
 * Périmètre : ce que la RLS rend (mes groupes + mes référés) ; tout le club
 * pour un admin, qui peut se limiter à sa part (`?vue=moi`).
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; section?: string }>;
}) {
  const { vue, section } = await searchParams;
  const role = await getNavRole();
  if (role !== "admin" && role !== "coach") redirect("/");
  const isAdmin = role === "admin";
  const supabase = await createClient();
  const user = await getCachedUser();
  const meId = user?.id ?? "";
  const mineOnly = isAdmin && vue === "moi";

  let players = await getPlayersWithDiscipline(supabase);
  if (mineOnly) {
    const mine = new Set(await getMyPlayerIds(supabase, meId));
    players = players.filter((p) => mine.has(p.id));
  }
  const ids = players.map((p) => p.id);
  const weekStart = currentWeekStart();

  const [rows, pending, visioDecided, proposals, { data: parentLinks }] = await Promise.all([
    getHomeRows(supabase, { viewerId: meId, isAdmin, players }),
    getDrafts(supabase, {
      playerIds: ids,
      kinds: ["review_reply", "parent_report", "visio"],
      statuses: ["pending", "error"],
    }),
    getDrafts(supabase, { playerIds: ids, kinds: ["visio"], periods: [weekStart], statuses: ["sent", "dismissed"] }),
    getProgramProposals(supabase, players),
    ids.length === 0
      ? Promise.resolve({ data: [] as { player_id: string }[] })
      : supabase.from("parent_links").select("player_id").in("player_id", ids),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const who = (id: string): QueuePlayer => {
    const r = byId.get(id);
    return {
      id,
      name: r ? `${r.firstName} ${r.lastName}`.trim() : "Joueur",
      firstName: r?.firstName ?? "",
      coach: r?.coachFirstName ?? null,
    };
  };
  const decided = new Set(visioDecided.map((d) => d.player_id));
  const thisWeekVisio = new Map(
    pending.filter((d) => d.kind === "visio" && d.period === weekStart).map((d) => [d.player_id, d])
  );

  const data: QueueData = {
    messages: rows
      .filter((r) => r.unread)
      .map((r) => ({
        ...who(r.id),
        preview: r.lastMessagePreview,
        at: r.lastExchangeAt,
        href: `/coach/joueurs/${r.id}?onglet=messages&canal=${channelKey(r.unreadChannel)}`,
      })),
    reviews: rows
      .filter((r) => r.review === "to-reply" && r.reviewDetail)
      .map((r) => {
        const d = r.reviewDetail!;
        const draft = pending.find((x) => x.kind === "review_reply" && x.review_id === d.id);
        return {
          ...who(r.id),
          reviewId: d.id,
          weekLabel: formatWeekRangeFr(d.weekStart),
          wentWell: d.wentWell,
          toImprove: d.toImprove,
          health: d.healthStatus,
          healthNote: d.healthNote,
          draft: draft && draft.status === "pending" ? { id: draft.id, body: draft.body, reason: draft.reason } : null,
          draftFailed: draft?.status === "error",
        };
      }),
    visios: rows
      .filter((r) => r.dropout && !decided.has(r.id))
      .map((r) => {
        const draft = thisWeekVisio.get(r.id);
        const fromJarvis = draft?.status === "pending" && !!draft.body;
        return {
          ...who(r.id),
          reasons: r.dropout!.reasons,
          body: fromJarvis
            ? draft!.body
            : `Salut ${r.firstName} ! J'aimerais qu'on prenne 20 minutes en visio cette semaine pour faire le point ensemble, sur ce qui va et ce qui coince. Quel créneau t'arrangerait ?`,
          reason: fromJarvis ? draft!.reason : null,
          fromJarvis,
        };
      }),
    programs: [...new Set(proposals.map((p) => p.playerId))].map((pid) => ({
      ...who(pid),
      items: proposals
        .filter((p) => p.playerId === pid)
        .map((p) => ({
          key: p.key,
          kind: p.kind,
          sessionName: p.sessionName,
          pole: p.kind === "add" ? p.pole : null,
          weekdays: p.kind === "add" ? p.weekdays : [],
          sessionId: p.kind === "add" ? p.sessionId : null,
          assignmentIds: p.kind === "pause" ? p.assignmentIds : [],
          reason: p.reason,
        })),
    })),
    reports: pending
      .filter((d) => d.kind === "parent_report" && d.status === "pending" && byId.has(d.player_id))
      .map((d) => ({
        ...who(d.player_id),
        draftId: d.id,
        body: d.body,
        reason: d.reason,
        monthLabel: formatMonthFr(d.period),
        parentCount: (parentLinks ?? []).filter((l) => l.player_id === d.player_id).length,
      })),
  };

  const minutes =
    data.messages.length * TASK_MINUTES.message +
    data.reviews.length * TASK_MINUTES.review +
    data.visios.length * TASK_MINUTES.visio +
    data.programs.length * TASK_MINUTES.program +
    data.reports.length * TASK_MINUTES.report;

  // la part de chaque coach (admin) : combien de gestes attendent chez qui
  const share = new Map<string, number>();
  if (isAdmin && !mineOnly) {
    const all = [...data.messages, ...data.reviews, ...data.visios, ...data.programs, ...data.reports];
    for (const item of all) {
      const label = item.coach ?? "Toi";
      share.set(label, (share.get(label) ?? 0) + 1);
    }
  }

  const today = parisNow().date;
  return (
    <TodayQueue
      data={data}
      minutes={minutes}
      isAdmin={isAdmin}
      mineOnly={mineOnly}
      share={[...share.entries()].sort((a, b) => b[1] - a[1])}
      configured={isMorningBriefConfigured()}
      reportMonthLabel={formatMonthFr(currentMonth(today))}
      initialFilter={section ?? null}
    />
  );
}
