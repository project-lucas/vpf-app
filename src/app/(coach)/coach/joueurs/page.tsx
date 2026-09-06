import { UserPlus } from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getNavRole } from "@/lib/auth";
import { getHealthByPlayer, getPlayersWithDiscipline, getWeekTracking } from "@/lib/coach-data";
import { getStaffInbox, getStaffUnreadPlayerIds, type InboxThread } from "@/lib/conversations";
import { currentWeekStart } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DisclosureBar } from "@/components/ui/DisclosureBar";
import { CoachInvitations } from "@/components/coach/CoachInvitations";
import { PlayersList, type PlayerInboxSummary, type PoleProgress } from "./PlayersList";
import type { Invitation, SessionPole } from "@/lib/types";

export const metadata = { title: "Joueurs — VPF" };
export const dynamic = "force-dynamic";

/**
 * Le fil à afficher pour un joueur dans la vue Messages : celui qui attend
 * une réponse s'il y en a un, sinon le plus récent. Les fils sont déjà triés
 * par récence (getStaffInbox).
 */
function summarize(threads: InboxThread[]): PlayerInboxSummary | null {
  const pick = threads.find((t) => t.hasUnread) ?? threads[0];
  if (!pick) return null;
  return {
    channelAdminId: pick.channelAdminId,
    lastAt: pick.lastAt,
    hasUnread: threads.some((t) => t.hasUnread),
  };
}

/**
 * La liste unique des joueurs — c'est aussi la boîte de réception : la vue
 * Messages s'ouvre en premier, avec le dernier message de chacun ; cliquer
 * une ligne ouvre la conversation dans la fiche (cf. PlayersList).
 * L'invitation d'un joueur, geste rare, est repliée derrière un bouton en bas
 * de page.
 *
 * C'est le seul écran staff SANS filtre `coach_id` : un admin y voit tout le
 * club (perf et formation), ses propres joueurs regroupés en tête. Un coach,
 * lui, ne voit que les siens — la RLS ne lui rend rien d'autre.
 */
export default async function CoachPlayersPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const weekStart = currentWeekStart();

  const [players, { data: invitations }, role] = await Promise.all([
    getPlayersWithDiscipline(supabase),
    user
      ? supabase
          .from("invitations")
          .select("*")
          .eq("coach_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    getNavRole(),
  ]);
  const playerIds = players.map((p) => p.id);
  const isAdmin = role === "admin";
  // « mes joueurs » : ceux dont je suis le coach référent. Eux seuls portent
  // la pastille rouge — la pastille dit « ça t'attend », et le fil d'un joueur
  // d'un collègue est à lui. Le reste du club se consulte, en gris.
  const myPlayerIds = players.filter((p) => p.coach_id === user?.id).map((p) => p.id);

  const usedByIds = ((invitations ?? []) as Invitation[])
    .map((i) => i.used_by)
    .filter((v): v is string => Boolean(v));

  // Tout ce que les vues affichent, en une salve : indépendant les uns des
  // autres, il n'y a aucune raison d'attendre.
  const [
    { data: usedByProfiles },
    { data: assignments },
    unreadPlayerIds,
    health,
    week,
    threads,
  ] = await Promise.all([
    usedByIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("profiles").select("id, first_name, last_name").in("id", usedByIds),
    // séances visibles (cochées) et faites, pour chaque joueur
    playerIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("session_assignments")
          .select(
            "player_id, session:library_sessions!inner(pole), completion:session_completions(status)"
          )
          .in("player_id", playerIds)
          .is("removed_at", null),
    user
      ? getStaffUnreadPlayerIds(supabase, user.id, myPlayerIds)
      : Promise.resolve(new Set<string>()),
    getHealthByPlayer(supabase, playerIds),
    getWeekTracking(supabase, playerIds, weekStart),
    // le dernier message de CHAQUE joueur affiché : la liste est la boîte de
    // réception, une ligne muette faute d'avoir été demandée serait un piège
    user
      ? getStaffInbox(supabase, user.id, isAdmin, playerIds)
      : Promise.resolve([] as InboxThread[]),
  ]);

  const usedByNames = new Map(
    (usedByProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  );
  const invitationRows: (Invitation & { used_by_name: string | null })[] = (
    (invitations ?? []) as Invitation[]
  ).map((inv) => ({
    ...inv,
    used_by_name: inv.used_by ? (usedByNames.get(inv.used_by) ?? "Joueur") : null,
  }));

  const progressByPlayer = new Map<string, PoleProgress>();
  for (const a of assignments ?? []) {
    const session = Array.isArray(a.session) ? a.session[0] : a.session;
    const completion = Array.isArray(a.completion) ? (a.completion[0] ?? null) : a.completion;
    const pole = session?.pole as SessionPole | undefined;
    if (!pole) continue;
    const progress =
      progressByPlayer.get(a.player_id) ??
      ({
        basket: { done: 0, total: 0 },
        physique: { done: 0, total: 0 },
        routine: { done: 0, total: 0 },
      } satisfies PoleProgress);
    progress[pole].total += 1;
    if (completion?.status === "done") progress[pole].done += 1;
    progressByPlayer.set(a.player_id, progress);
  }

  // la boîte de réception, joueur par joueur
  const threadsByPlayer = new Map<string, InboxThread[]>();
  for (const t of threads) {
    if (!playerIds.includes(t.playerId)) continue;
    (threadsByPlayer.get(t.playerId) ?? threadsByPlayer.set(t.playerId, []).get(t.playerId)!).push(t);
  }

  const unreadCount = players.filter((p) => unreadPlayerIds.has(p.id)).length;

  return (
    <>
      <PageHeader
        title="Joueurs"
        subtitle={
          unreadCount > 0
            ? `${myPlayerIds.length} à moi · ${players.length} au club · ${unreadCount} message${unreadCount > 1 ? "s" : ""} en attente`
            : `${myPlayerIds.length} à moi · ${players.length} joueur${players.length > 1 ? "s" : ""} actif${players.length > 1 ? "s" : ""} au club`
        }
      />

      {players.length === 0 ? (
        <EmptyState>
          Aucun joueur actif. Génère un lien d&apos;invitation ci-dessous et envoie-le à ton
          joueur.
        </EmptyState>
      ) : (
        <PlayersList
          players={players.map((p) => {
            const h = health.get(p.id);
            const inbox = summarize(threadsByPlayer.get(p.id) ?? []);
            const isMine = p.coach_id === user?.id;
            return {
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              season_goal: p.season_goal,
              offer: p.offer,
              availability: p.availability,
              discipline: p.discipline,
              progress: progressByPlayer.get(p.id) ?? null,
              whatsapp_number: p.whatsapp_number,
              is_mine: isMine,
              // un fil non lu que la boîte ne couvre pas (relais d'un collègue)
              // compte quand même : la pastille sait, la vue Messages montre
              has_unread_messages:
                isMine && (unreadPlayerIds.has(p.id) || Boolean(inbox?.hasUnread)),
              energy: h?.energy ?? null,
              pain: h?.pain ?? null,
              week: week.get(p.id) ?? null,
              inbox,
            };
          })}
        />
      )}

      {user && (
        <DisclosureBar
          className="mt-6"
          // liste vide : on ouvre d'entrée, inviter est la seule chose à faire
          initialKey={players.length === 0 ? "inviter" : null}
          items={[
            {
              key: "inviter",
              icon: <UserPlus size={16} />,
              label: "Inviter un joueur",
              content: (
                <CoachInvitations
                  coachId={user.id}
                  invitations={invitationRows}
                  appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
                  title="Inviter un joueur"
                />
              ),
            },
          ]}
        />
      )}
    </>
  );
}
