import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExclusionManager, type ManagedPlayer } from "./ExclusionManager";

export const metadata = { title: "Exclusion — VPF" };
export const dynamic = "force-dynamic";

export default async function AdminExclusionPage() {
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select(
      "id, status, coach_id, profile:profiles!players_id_fkey(first_name, last_name), coach:profiles!players_coach_id_fkey(first_name, last_name)"
    );

  const list: ManagedPlayer[] = (players ?? [])
    .map((p) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      const coach = Array.isArray(p.coach) ? p.coach[0] : p.coach;
      return {
        id: p.id,
        status: p.status as "active" | "archived",
        name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "(profil incomplet)",
        coachName: coach ? `${coach.first_name} ${coach.last_name}`.trim() : "?",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <>
      <PageHeader
        title="Exclusion"
        subtitle="Archive un joueur en fin d'abonnement, réactive-le à son retour."
      />
      <ExclusionManager players={list} />
    </>
  );
}
