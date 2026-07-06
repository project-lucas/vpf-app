import Link from "next/link";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SessionPole } from "@/lib/types";

export const metadata = { title: "Mes joueurs — VPF" };
export const dynamic = "force-dynamic";

const POLE_CHIPS: { pole: SessionPole; label: string }[] = [
  { pole: "basket", label: "Technique" },
  { pole: "physique", label: "Physique" },
  { pole: "routine", label: "Routine" },
];

type PoleProgress = Record<SessionPole, { done: number; total: number }>;

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
        <div className="space-y-2.5">
          {players.map((p) => {
            const progress = progressByPlayer.get(p.id);
            return (
              <Link
                key={p.id}
                href={`/coach/joueurs/${p.id}`}
                className="block rounded-2xl border border-navy-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-navy-900">
                    {p.first_name} {p.last_name}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold ${
                      p.discipline === null
                        ? "bg-navy-100 text-navy-400"
                        : p.discipline < LOW_DISCIPLINE_THRESHOLD
                          ? "bg-danger-soft text-danger"
                          : "bg-success-soft text-success"
                    }`}
                  >
                    {formatPercent(p.discipline)}
                  </span>
                </div>
                {p.season_goal && (
                  <p className="mt-1 line-clamp-2 text-sm text-navy-400">
                    <Target size={12} className="-mt-0.5 inline" /> {p.season_goal}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {POLE_CHIPS.map(({ pole, label }) => {
                    const stats = progress?.[pole];
                    const empty = !stats || stats.total === 0;
                    const complete = !empty && stats.done === stats.total;
                    return (
                      <span
                        key={pole}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          empty
                            ? "bg-navy-50 text-navy-300"
                            : complete
                              ? "bg-success-soft text-success"
                              : "bg-navy-100 text-navy-600"
                        }`}
                      >
                        {label}{" "}
                        {empty ? "—" : `${stats.done}/${stats.total}`}
                      </span>
                    );
                  })}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
