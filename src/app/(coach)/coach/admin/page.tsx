import { redirect } from "next/navigation";
import { Megaphone, Route, Sparkles, UserPlus, UserRoundPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateCoachButton } from "./CreateCoachButton";
import { AnnouncementsManager } from "./AnnouncementsManager";
import { AdminTools } from "./AdminTools";
import { GroupBoard, type BoardGroup, type BoardStaff } from "./GroupBoard";
import { MorningBriefPanel } from "./MorningBriefPanel";
import { PlayerJourneyPanel } from "./PlayerJourneyPanel";
import { CoachInvitations, type CoachChoice } from "@/components/coach/CoachInvitations";
import { getGroupsWithStaff } from "@/lib/groups";
import { getLastBriefDates, isMorningBriefConfigured } from "@/lib/briefs";
import type { Announcement, Invitation } from "@/lib/types";

export const metadata = { title: "Admin — VPF" };
export const dynamic = "force-dynamic";

/**
 * Onglet Admin : l'organisation du service, sur un écran, sans défilement.
 *
 * En tête, la barre d'outils (Annonces, Jarvis du matin, Nouveau coach,
 * Nouveau joueur), chaque outil ouvert dans un volet. Dessous, le tableau des
 * groupes (`GroupBoard`) : une colonne par groupe avec son staff (un nom par
 * ligne ; déplacer, retirer du groupe, supprimer le compte en trois clics),
 * puis ses joueurs, retirables en trois clics ; la dernière colonne crée le
 * groupe suivant. Le travail détaillé d'un coach se lit sur sa fiche
 * (`/coach/club/<id>`), ouverte d'un clic sur son nom.
 *
 * Tout ici couvre le club entier. Réservé aux admins (redirection sinon).
 */
export default async function AdminPage() {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") redirect("/coach");

  const supabase = await createClient();

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

  // les invitations que J'ai créées, quel que soit le coach visé
  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("created_by", profile.id)
    .order("created_at", { ascending: false });

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

  // ---- le tableau des groupes
  const boardStaff: BoardStaff[] = (staff ?? []).map((m) => ({
    id: m.id,
    name: `${m.first_name} ${m.last_name}`.trim() || "(profil incomplet)",
    isAdmin: m.role === "admin",
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
              label: "À savoir sur Jarvis",
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
              key: "parcours",
              icon: <Route size={16} />,
              label: "Parcours",
              content: <PlayerJourneyPanel />,
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

      <GroupBoard groups={boardGroups} staff={boardStaff} meId={profile.id} />
    </div>
  );
}
