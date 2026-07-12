import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CoachInvitations } from "@/components/coach/CoachInvitations";
import { PlayersList, type PoleProgress } from "./PlayersList";
import type { Invitation, SessionPole } from "@/lib/types";

export const metadata = { title: "Mes joueurs — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachPlayersPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  // filtre coach_id explicite : un admin ne voit ici QUE ses propres joueurs
  const players = await getPlayersWithDiscipline(supabase, user?.id);

  // Coachs et admins invitent leurs propres joueurs directement ici (les actions
  // re-vérifient le rôle et la propriété côté serveur).
  let invitationRows: (Invitation & { used_by_name: string | null })[] = [];
  if (user) {
    const { data: invitations } = await supabase
      .from("invitations")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
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
    invitationRows = ((invitations ?? []) as Invitation[]).map((inv) => ({
      ...inv,
      used_by_name: inv.used_by ? (usedByNames.get(inv.used_by) ?? "Joueur") : null,
    }));
  }

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
          Aucun joueur actif. Génère un lien d&apos;invitation ci-dessous et envoie-le à ton
          joueur.
        </EmptyState>
      ) : (
        <PlayersList
          players={players.map((p) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            season_goal: p.season_goal,
            availability: p.availability,
            discipline: p.discipline,
            progress: progressByPlayer.get(p.id) ?? null,
          }))}
        />
      )}

      {user && (
        <div className="mt-5">
          <CoachInvitations
            coachId={user.id}
            invitations={invitationRows}
            appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
            title="Inviter un joueur"
          />
        </div>
      )}
    </>
  );
}
