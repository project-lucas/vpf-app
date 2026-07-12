import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getNavRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryView } from "@/components/library/LibraryView";
import type { LibrarySession } from "@/lib/types";

export const metadata = { title: "Séances — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachLibraryPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const isAdmin = (await getNavRole()) === "admin";

  const [{ data: sessions }, { data: players }, { data: assignments }] = await Promise.all([
    supabase.from("library_sessions").select("*").order("name"),
    supabase
      .from("players")
      .select("id, profile:profiles!players_id_fkey(first_name, last_name)")
      .eq("status", "active"),
    supabase.from("session_assignments").select("session_id, player_id").is("removed_at", null),
  ]);

  const assignablePlayers = (players ?? [])
    .map((p) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      return { id: p.id, name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // séance → joueurs qui la voient (uniquement les joueurs actifs du coach)
  const playerIds = new Set(assignablePlayers.map((p) => p.id));
  const visibility: Record<string, string[]> = {};
  for (const a of assignments ?? []) {
    if (!playerIds.has(a.player_id)) continue;
    (visibility[a.session_id] ??= []).push(a.player_id);
  }

  // le coach crée ses propres séances et ne peut modifier que celles-ci ;
  // l'admin gère toute la bibliothèque (dont les programmes)
  const allSessions = (sessions ?? []) as LibrarySession[];
  const manageableIds = isAdmin
    ? allSessions.map((s) => s.id)
    : allSessions.filter((s) => s.created_by === user?.id).map((s) => s.id);

  return (
    <>
      <PageHeader
        title="Séances"
        subtitle="Crée tes séances et coche pour chacune les joueurs qui peuvent la voir."
      />
      <LibraryView
        sessions={allSessions}
        players={assignablePlayers}
        visibility={visibility}
        editable
        manageableIds={manageableIds}
      />
    </>
  );
}
