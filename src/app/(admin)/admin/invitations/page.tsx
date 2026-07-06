import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvitationsManager } from "./InvitationsManager";
import type { Invitation } from "@/lib/types";

export const metadata = { title: "Invitations — VPF" };
export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage() {
  const supabase = await createClient();

  const [{ data: invitations }, { data: coachs }, { data: usedByProfiles }] = await Promise.all([
    supabase.from("invitations").select("*").order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "coach")
      .order("first_name"),
    supabase.from("profiles").select("id, first_name, last_name").eq("role", "player"),
  ]);

  const coachList = (coachs ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim(),
  }));

  const playerNames = new Map(
    (usedByProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  );

  const list = ((invitations ?? []) as Invitation[]).map((inv) => ({
    ...inv,
    coach_name: coachList.find((c) => c.id === inv.coach_id)?.name ?? "?",
    used_by_name: inv.used_by ? (playerNames.get(inv.used_by) ?? "Joueur") : null,
  }));

  return (
    <>
      <PageHeader
        title="Invitations"
        subtitle="Chaque lien est unique et utilisable une seule fois."
      />
      <InvitationsManager
        invitations={list}
        coachs={coachList}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </>
  );
}
