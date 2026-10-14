import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { DEFAULT_HISTORY_WEEKS, HISTORY_WEEK_CHOICES, getHomeRows } from "@/lib/staff-overview";
import { getGroupsWithStaff, NO_GROUP_LABEL, staffFirstNames } from "@/lib/groups";
import { getBriefsForDate, isMorningBriefConfigured } from "@/lib/briefs";
import { getRecentJournal } from "@/lib/journal";
import { parisNow } from "@/lib/dates";
import { getNavRole } from "@/lib/auth";
import { StaffHome, NO_GROUP_ID, type HomeBrief, type HomeGroup } from "@/components/coach/StaffHome";
import { PushPrompt } from "@/components/PushPrompt";

export const metadata = { title: "Accueil — VPF" };
export const dynamic = "force-dynamic";
// Jarvis (server action de cette page) enchaîne appels au modèle et outils
export const maxDuration = 60;

/**
 * Accueil du staff : la vue tableau, un groupe à la fois (cf. `StaffHome`).
 * La page rassemble et sérialise ; elle ne décide de rien — les lignes
 * viennent de `getHomeRows` (`src/lib/staff-overview.ts`), le brief du matin
 * de `getBriefsForDate` (0042), le journal de `getRecentJournal`.
 *
 * Périmètre : les joueurs que la RLS me rend (mes groupes + mes référés) ;
 * tout le club pour un admin, ses groupes en tête.
 */
export default async function CoachDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ semaines?: string }>;
}) {
  const { semaines } = await searchParams;
  const asked = Number(semaines);
  const weeks = (HISTORY_WEEK_CHOICES as readonly number[]).includes(asked) ? asked : DEFAULT_HISTORY_WEEKS;
  const supabase = await createClient();
  const user = await getCachedUser();
  const meId = user?.id ?? "";
  const isAdmin = (await getNavRole()) === "admin";
  const today = parisNow().date;

  const [players, allGroups] = await Promise.all([
    getPlayersWithDiscipline(supabase),
    getGroupsWithStaff(supabase),
  ]);

  const [rows, briefs, journal, { data: profile }] = await Promise.all([
    getHomeRows(supabase, { viewerId: meId, isAdmin, players, weeks }),
    getBriefsForDate(
      supabase,
      allGroups.map((g) => g.id),
      today
    ),
    getRecentJournal(supabase, 40),
    user
      ? supabase.from("profiles").select("notifications_enabled").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ---- les groupes à montrer : les miens d'abord, puis ceux qui ont des joueurs
  const countOf = (gid: string | null) => players.filter((p) => p.group_id === gid).length;
  const groups: HomeGroup[] = allGroups
    .map((g) => ({
      id: g.id,
      name: g.name,
      staffNames: staffFirstNames(g),
      isMine: g.staff.some((s) => s.id === meId),
      count: countOf(g.id),
    }))
    .filter((g) => g.isMine || g.count > 0)
    .sort((a, b) => Number(b.isMine) - Number(a.isMine))
    .map(({ id, name, staffNames, isMine }) => ({ id, name, staffNames, isMine }));
  if (countOf(null) > 0 || groups.length === 0) {
    groups.push({ id: NO_GROUP_ID, name: NO_GROUP_LABEL, staffNames: "", isMine: false });
  }
  const initialGroupId =
    groups.find((g) => g.isMine && countOf(g.id) > 0)?.id ??
    groups.find((g) => countOf(g.id === NO_GROUP_ID ? null : g.id) > 0)?.id ??
    groups[0].id;

  const briefsByGroup: Record<string, HomeBrief> = {};
  for (const [gid, b] of briefs) {
    briefsByGroup[gid] = { summary: b.summary, recommendations: b.recommendations, createdAt: b.created_at };
  }

  const journalToday = journal
    .filter((e) => parisNow(new Date(e.created_at)).date === today)
    .map((e) => ({
      id: e.id,
      actorName: e.actorName,
      actorKind: e.actor_kind,
      summary: e.summary,
      at: new Date(e.created_at).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      }),
    }));

  const todayLabel = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });

  return (
    <>
      <StaffHome
        groups={groups}
        rows={rows}
        briefs={briefsByGroup}
        journalToday={journalToday}
        briefConfigured={isMorningBriefConfigured()}
        isAdmin={isAdmin}
        todayLabel={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
        initialGroupId={initialGroupId}
        weeks={weeks}
      />
      <PushPrompt
        notificationsEnabled={profile?.notifications_enabled ?? true}
        title="Active tes notifications"
        description="Messages des joueurs et des parents, alertes douleur."
      />
    </>
  );
}
