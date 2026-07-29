import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getNavRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryView } from "@/components/library/LibraryView";
import { HygieneVideoLibrary } from "@/components/coach/HygieneVideoLibrary";
import type { HygieneVideo, LibrarySession } from "@/lib/types";

export const metadata = { title: "Séances — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachLibraryPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const isAdmin = (await getNavRole()) === "admin";

  const [
    { data: sessions },
    { data: players },
    { data: assignments },
    { data: hygieneVideos },
    { data: hygieneAssignments },
  ] = await Promise.all([
    supabase.from("library_sessions").select("*").order("name"),
    supabase
      .from("players")
      .select("id, offer, profile:profiles!players_id_fkey(first_name, last_name)")
      .eq("status", "active"),
    supabase.from("session_assignments").select("session_id, player_id").is("removed_at", null),
    supabase.from("hygiene_videos").select("*").order("category").order("title"),
    supabase.from("hygiene_video_assignments").select("video_id, player_id"),
  ]);

  const assignablePlayers = (players ?? [])
    .map((p) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      return {
        id: p.id,
        name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
        offer: p.offer as string,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // vidéos hygiène : seuls les joueurs formation portent l'onglet Hygiène de vie
  const formationPlayers = assignablePlayers
    .filter((p) => p.offer === "formation")
    .map(({ id, name }) => ({ id, name }));
  const formationIds = new Set(formationPlayers.map((p) => p.id));
  const hygieneVisibility: Record<string, string[]> = {};
  for (const a of hygieneAssignments ?? []) {
    if (!formationIds.has(a.player_id)) continue;
    (hygieneVisibility[a.video_id] ??= []).push(a.player_id);
  }

  // séance → joueurs qui la voient (uniquement les joueurs actifs du coach)
  const playerIds = new Set(assignablePlayers.map((p) => p.id));
  const visibility: Record<string, string[]> = {};
  for (const a of assignments ?? []) {
    if (!playerIds.has(a.player_id)) continue;
    (visibility[a.session_id] ??= []).push(a.player_id);
  }

  // seul l'admin crée des séances ; un coach ne peut retoucher que celles
  // qu'il avait créées auparavant, l'admin gère toute la bibliothèque
  const allSessions = (sessions ?? []) as LibrarySession[];
  const manageableIds = isAdmin
    ? allSessions.map((s) => s.id)
    : allSessions.filter((s) => s.created_by === user?.id).map((s) => s.id);

  return (
    <>
      <PageHeader
        title="Séances"
        subtitle={
          isAdmin
            ? "Crée les séances du club et coche pour chacune les joueurs qui peuvent la voir."
            : "Coche pour chaque séance les joueurs qui peuvent la voir."
        }
      />
      <LibraryView
        sessions={allSessions}
        players={assignablePlayers.map(({ id, name }) => ({ id, name }))}
        visibility={visibility}
        editable
        manageableIds={manageableIds}
        isAdmin={isAdmin}
      />

      <div className="mt-6">
        <HygieneVideoLibrary
          videos={(hygieneVideos ?? []) as HygieneVideo[]}
          players={formationPlayers}
          visibility={hygieneVisibility}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
