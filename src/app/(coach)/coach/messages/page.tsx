import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ChevronLeft, HeartPulse, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import { getAdminInbox, listStaffAdmins } from "@/lib/conversations";
import { getHealthByPlayer, getPlayersWithDiscipline } from "@/lib/coach-data";
import { getConversationMessages } from "@/app/actions/messages";
import { MessageThread } from "@/components/messages/MessageThread";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AVAILABILITY_LABELS, LOW_DISCIPLINE_THRESHOLD, STAFF_CHANNEL_KEY } from "@/lib/constants";
import type { PlayerAvailability } from "@/lib/types";
import { formatPercent } from "@/lib/discipline";
import { formatAgoFr } from "@/lib/dates";
import { InboxList } from "./InboxList";

export const metadata = { title: "Messages — VPF" };
export const dynamic = "force-dynamic";

/**
 * Boîte de réception du staff — coachs ET admins.
 *
 * « Mes fils » réunit tout ce dont on est destinataire : le fil coach &
 * parents de chacun de ses joueurs et, pour un admin, ses fils privés (0034).
 * Les onglets « Fils de <admin> » restent réservés aux admins : ils servent à
 * prendre le relais d'un collègue absent, pas à consulter sa boîte au quotidien.
 *
 * La liste elle-même (tri, filtre, réponse rapide) est dans InboxList.
 */
export default async function CoachMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ fil?: string; joueur?: string; canal?: string }>;
}) {
  const { profile } = await getAuthProfile();
  if (!profile || (profile.role !== "coach" && profile.role !== "admin")) redirect("/coach");

  const isAdmin = profile.role === "admin";
  const { fil, joueur, canal } = await searchParams;
  const supabase = await createClient();
  const admins = isAdmin ? await listStaffAdmins() : [];

  // Onglet de relais : un `fil` inconnu (lien périmé, admin supprimé) ou un
  // coach qui tenterait le paramètre à la main retombent sur leurs propres fils.
  const relayAdminId =
    isAdmin && fil && fil !== profile.id && admins.some((a) => a.id === fil) ? fil : null;
  const relayAdmin = admins.find((a) => a.id === relayAdminId);

  // ---- Un fil ouvert -------------------------------------------------------
  if (joueur) {
    // `canal` porte le canal ouvert : "staff" = fil coach & parents, sinon
    // l'admin qui porte le fil privé. Un canal hors de portée ne renverra
    // simplement aucun message (la RLS tranche).
    const channelAdminId = canal && canal !== STAFF_CHANNEL_KEY ? canal : (relayAdminId ?? null);

    // En-tête utile : dispo, discipline, dernier check-in — pour répondre en
    // connaissance de cause sans l'aller-retour vers la fiche. La discipline
    // n'existe que pour SES joueurs (un admin sur un fil privé d'un joueur
    // qu'il n'encadre pas verra « — »).
    const [messages, { data: playerProfile }, { data: playerRow }, myPlayers, health] =
      await Promise.all([
        getConversationMessages(joueur, channelAdminId),
        supabase.from("profiles").select("first_name, last_name").eq("id", joueur).maybeSingle(),
        supabase.from("players").select("availability, offer").eq("id", joueur).maybeSingle(),
        getPlayersWithDiscipline(supabase, profile.id),
        getHealthByPlayer(supabase, [joueur]),
      ]);
    const playerName = playerProfile
      ? `${playerProfile.first_name} ${playerProfile.last_name}`.trim()
      : "Joueur";
    const mine = myPlayers.find((p) => p.id === joueur);
    const h = health.get(joueur);
    const availability = (playerRow?.availability ?? "available") as PlayerAvailability;

    const isPrivate = channelAdminId !== null;
    const isRelay = isPrivate && channelAdminId !== profile.id;

    return (
      <>
        <Link
          href={relayAdminId ? `/coach/messages?fil=${relayAdminId}` : "/coach/messages"}
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-500"
        >
          <ChevronLeft size={16} />
          Tous les fils
        </Link>
        <PageHeader
          title={playerName}
          subtitle={
            !isPrivate
              ? "Fil global — le joueur, ses parents et le staff."
              : isRelay
                ? `Fil privé de ${relayAdmin?.firstName ?? "l'admin"} — vous prenez le relais.`
                : "Fil privé — le joueur et toi ; les admins peuvent le lire."
          }
          action={
            <Link
              href={`/coach/joueurs/${joueur}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-navy-200 bg-white px-3 py-2 text-xs font-bold text-navy-700 transition-colors hover:border-navy-400"
            >
              Fiche <ArrowUpRight size={13} />
            </Link>
          }
        />

        {/* la ligne de contexte : ce qu'il faut savoir avant de répondre */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {availability !== "available" ? (
            <Badge tone={availability === "injured" ? "danger" : "neutral"}>
              {AVAILABILITY_LABELS[availability]}
            </Badge>
          ) : (
            <Badge>Disponible</Badge>
          )}
          <Badge
            tone={
              mine?.discipline !== null && mine?.discipline !== undefined && mine.discipline < LOW_DISCIPLINE_THRESHOLD
                ? "warning"
                : "neutral"
            }
          >
            Discipline {formatPercent(mine?.discipline ?? null)}
          </Badge>
          {h?.pain && (
            <Badge tone={h.pain.score >= 5 ? "danger" : "neutral"}>
              <HeartPulse size={11} /> Douleurs {h.pain.score}/10 · {formatAgoFr(h.pain.at)}
            </Badge>
          )}
          {h?.energy && (
            <Badge tone={h.energy.score <= 4 ? "warning" : "neutral"}>
              <Zap size={11} /> Énergie {h.energy.score}/10
            </Badge>
          )}
        </div>

        <Card>
          <MessageThread
            playerId={joueur}
            currentUserId={profile.id}
            channelAdminId={channelAdminId}
            initialMessages={messages}
            variant="coach"
            className="h-[calc(100dvh-380px)] min-h-[360px]"
          />
        </Card>
      </>
    );
  }

  // ---- La liste ------------------------------------------------------------
  // La boîte de réception du quotidien vit dans Joueurs (vue Messages). Ici ne
  // reste que le relais entre admins : les fils privés d'un collègue absent.
  const others = admins.filter((a) => a.id !== profile.id);
  if (!isAdmin || others.length === 0) redirect("/coach/joueurs");
  const shownAdminId = relayAdminId ?? others[0].id;
  const shownAdmin = admins.find((a) => a.id === shownAdminId);
  const threads = await getAdminInbox(supabase, shownAdminId, profile.id);

  const unreadCount = threads.filter((t) => t.hasUnread).length;

  return (
    <>
      <PageHeader
        title="Relais"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} message${unreadCount > 1 ? "s" : ""} en attente chez ${shownAdmin?.firstName ?? "ton collègue"}.`
            : `Les fils privés de ${shownAdmin?.firstName ?? "ton collègue"} — pour prendre la main en son absence.`
        }
      />

      {/* Un onglet par collègue admin (0034). Tes propres fils, eux, sont dans
          Joueurs — pas de doublon ici. */}
      {others.length > 1 && (
        <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pointer-fine:mx-0 pointer-fine:flex-wrap pointer-fine:overflow-x-visible pointer-fine:px-0">
          {others.map((a) => (
            <Link
              key={a.id}
              href={`/coach/messages?fil=${a.id}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                a.id === shownAdminId
                  ? "bg-navy-800 text-white"
                  : "border border-navy-200 bg-white text-navy-500"
              }`}
            >
              Fils de {a.firstName}
            </Link>
          ))}
        </div>
      )}

      {threads.length === 0 ? (
        <EmptyState>
          Aucun joueur en offre formation pour l&apos;instant — les fils privés n&apos;existent
          que pour cette offre.
        </EmptyState>
      ) : (
        <InboxList threads={threads} relayAdminId={shownAdminId} />
      )}
    </>
  );
}
