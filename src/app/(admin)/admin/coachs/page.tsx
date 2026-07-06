import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoachsManager, type CoachWithPlayers } from "./CoachsManager";

export const metadata = { title: "Coachs — VPF" };
export const dynamic = "force-dynamic";

export default async function AdminCoachsPage() {
  const supabase = await createClient();

  const [{ data: coachs }, { data: players }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, whatsapp_number")
      .eq("role", "coach")
      .order("first_name"),
    supabase
      .from("players")
      .select("id, coach_id, status, profile:profiles!players_id_fkey(first_name, last_name)"),
  ]);

  const list: CoachWithPlayers[] = (coachs ?? []).map((c) => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    whatsapp_number: c.whatsapp_number,
    players: (players ?? [])
      .filter((p) => p.coach_id === c.id)
      .map((p) => {
        const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
        return {
          id: p.id,
          name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "(profil incomplet)",
          status: p.status as "active" | "archived",
        };
      }),
  }));

  return (
    <>
      <PageHeader title="Coachs" subtitle={`${list.length} coach(s)`} />
      <CoachsManager coachs={list} />
    </>
  );
}
