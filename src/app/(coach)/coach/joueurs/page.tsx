import { UserPlus } from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getNavRole } from "@/lib/auth";
import { getHealthByPlayer, getPlayersWithDiscipline, getWeekTracking } from "@/lib/coach-data";
import { getMyPlayerIds, getStaffInbox, getStaffUnreadPlayerIds, type InboxThread } from "@/lib/conversations";
import { getBriefsForDate, isMorningBriefConfigured, type BriefRecommendation } from "@/lib/briefs";
import { currentWeekStart, parisNow } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DisclosureBar } from "@/components/ui/DisclosureBar";
import { CoachInvitations } from "@/components/coach/CoachInvitations";
import { getGroupsWithStaff } from "@/lib/groups";
import { PlayersList, type PlayerInboxSummary } from "./PlayersList";
import type { Invitation } from "@/lib/types";

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
    channel: pick.channel,
    lastAt: pick.lastAt,
    hasUnread: threads.some((t) => t.hasUnread),
  };
}

/**
 * La liste unique des joueurs — c'est aussi la boîte de réception : la vue
 * Messages s'ouvre en premier, avec le dernier message de chacun ; cliquer
 * une ligne ouvre la conversation dans la fiche (cf. PlayersList).
 * L'invitation d'un joueur, réservée aux admins, est repliée derrière un
 * bouton en tête, au-dessus de la liste — un coach n'invite pas : c'est un
 * admin qui lui affecte ses joueurs. Le panneau ne garde que les liens en
 * attente (les invitations utilisées ne servent plus à rien ici).
 *
 * C'est le seul écran staff SANS filtre `coach_id` : un admin y voit tout le
 * club (perf et formation), ses propres joueurs regroupés en tête. Un coach,
 * lui, ne voit que les siens — la RLS ne lui rend rien d'autre.
 */
export default async function CoachPlayersPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const weekStart = currentWeekStart();

  const [players, role] = await Promise.all([getPlayersWithDiscipline(supabase), getNavRole()]);
  const playerIds = players.map((p) => p.id);
  // cookie de navigation : sert à adapter l'UI, jamais d'autorisation — les
  // server actions d'invitation revérifient le rôle en base (requireAdmin)
  const isAdmin = role === "admin";
  // les invitations ne servent qu'au panneau admin : un coach n'en a pas
  const { data: invitations } =
    user && isAdmin
      ? await supabase
          .from("invitations")
          .select("*")
          .eq("coach_id", user.id)
          .order("created_at", { ascending: false })
      : { data: null };
  // « mes joueurs » : ceux dont je suis le coach référent. Eux seuls portent
  // la pastille rouge — la pastille dit « ça t'attend », et le fil d'un joueur
  // d'un collègue est à lui. Le reste du club se consulte, en gris.
  // depuis les groupes (0040), « mes joueurs » = mes référés + les joueurs des
  // groupes dont je suis staff : à deux sur le groupe A, la même liste
  const myPlayerIds = user ? await getMyPlayerIds(supabase, user.id) : [];
  const myIds = new Set(myPlayerIds);
  // les suggestions de Jarvis du matin, joueur par joueur
  const groupIds = [...new Set(players.map((p) => p.group_id).filter((g): g is string => Boolean(g)))];
  const briefs = await getBriefsForDate(supabase, groupIds, parisNow().date);
  const recosByPlayer: Record<string, BriefRecommendation[]> = {};
  for (const b of briefs.values()) {
    for (const r of b.recommendations) {
      if (r.playerId) (recosByPlayer[r.playerId] ??= []).push(r);
    }
  }

  // Tout ce que les vues affichent, en une salve : indépendant les uns des
  // autres, il n'y a aucune raison d'attendre.
  const [unreadPlayerIds, health, week, threads, groups] = await Promise.all([
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
    getGroupsWithStaff(supabase),
  ]);

  const invitationRows: (Invitation & { used_by_name: string | null })[] = (
    (invitations ?? []) as Invitation[]
  ).map((inv) => ({ ...inv, used_by_name: null }));

  // les filtres de groupe : seulement ceux qui ont des joueurs dans la liste
  const groupChips = groups
    .filter((g) => players.some((p) => p.group_id === g.id))
    .map((g) => ({ id: g.id, name: g.name }));

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
        subtitle={`${players.length} joueur${players.length > 1 ? "s" : ""} actif${players.length > 1 ? "s" : ""}${unreadCount > 0 ? ` · ${unreadCount} message${unreadCount > 1 ? "s" : ""} en attente` : ""} · triés par urgence`}
      />

      {/* Inviter : admin uniquement (un coach classique n'invite pas) */}
      {user && isAdmin && (
        <DisclosureBar
          className="mb-4"
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
      {players.length === 0 ? (
        <EmptyState>
          {isAdmin
            ? "Aucun joueur actif. Génère un lien d'invitation ci-dessus et envoie-le à ton joueur."
            : "Aucun joueur actif. Un admin t'affectera tes joueurs depuis l'onglet Staff."}
        </EmptyState>
      ) : (
        <PlayersList
          groups={groupChips}
          recosByPlayer={recosByPlayer}
          briefConfigured={isMorningBriefConfigured()}
          players={players.map((p) => {
            const h = health.get(p.id);
            const inbox = summarize(threadsByPlayer.get(p.id) ?? []);
            const isMine = myIds.has(p.id);
            return {
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              season_goal: p.season_goal,
              offer: p.offer,
              availability: p.availability,
              discipline: p.discipline,
              whatsapp_number: p.whatsapp_number,
              group_id: p.group_id,
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

    </>
  );
}
