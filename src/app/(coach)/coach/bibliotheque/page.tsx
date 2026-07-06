import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryView } from "@/components/library/LibraryView";
import type { LibrarySession } from "@/lib/types";

export const metadata = { title: "Bibliothèque — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachLibraryPage() {
  const supabase = await createClient();

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

  return (
    <>
      <PageHeader
        title="Bibliothèque"
        subtitle="Coche pour chaque séance les joueurs qui peuvent la voir."
      />
      <LibraryView
        sessions={(sessions ?? []) as LibrarySession[]}
        players={assignablePlayers}
        visibility={visibility}
        editable={false}
      />
    </>
  );
}
