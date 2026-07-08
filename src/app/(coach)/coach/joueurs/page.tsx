import { createClient } from "@/lib/supabase/server";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlayersList, type PoleProgress } from "./PlayersList";
import type { SessionPole } from "@/lib/types";

export const metadata = { title: "Mes joueurs — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachPlayersPage() {
  const supabase = await createClient();
  const players = await getPlayersWithDiscipline(supabase);

  // Avancement par pôle : séances visibles (cochées) et faites, pour chaque joueur
  const { data: assignments } = await supabase
    .from("session_assignments")
    .select("player_id, session:library_sessions!inner(pole), completion:session_completions(status)")
    .in(
      "player_id",
      players.map((p) => p.id)
    )
    .is("removed_at", null);

  const progressByPlayer = new Map<string, PoleProgress>();
  for (const a of assignments ?? []) {
    const session = Array.isArray(a.session) ? a.session[0] : a.session;
    const completion = Array.isArray(a.completion) ? (a.completion[0] ?? null) : a.completion;
    const pole = session?.pole as SessionPole | undefined;
    if (!pole) continue;
    const progress =
      progressByPlayer.get(a.player_id) ??
      ({
        basket: { done: 0, total: 0 },
        physique: { done: 0, total: 0 },
        routine: { done: 0, total: 0 },
      } satisfies PoleProgress);
    progress[pole].total += 1;
    if (completion?.status === "done") progress[pole].done += 1;
    progressByPlayer.set(a.player_id, progress);
  }

  return (
    <>
      <PageHeader title="Mes joueurs" subtitle={`${players.length} joueur(s) actif(s)`} />

      {players.length === 0 ? (
        <EmptyState>
          Aucun joueur actif. Les joueurs rejoignent VPF via une invitation créée par l&apos;admin.
        </EmptyState>
      ) : (
        <PlayersList
          players={players.map((p) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            season_goal: p.season_goal,
            discipline: p.discipline,
            progress: progressByPlayer.get(p.id) ?? null,
          }))}
        />
      )}
    </>
  );
}
