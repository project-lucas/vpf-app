import { createClient } from "@/lib/supabase/server";
import { averageDiscipline, getPlayersWithDiscipline } from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";

export const metadata = { title: "Admin — VPF" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [players, { count: coachCount }] = await Promise.all([
    getPlayersWithDiscipline(supabase),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "coach"),
  ]);

  const avg = averageDiscipline(players);
  const lowDiscipline = players.filter(
    (p) => p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
  );

  return (
    <>
      <PageHeader title="Dashboard admin" subtitle="Vue globale du Centre de Performance." />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Joueurs actifs" value={`${players.length}`} />
        <StatCard label="Coachs" value={`${coachCount ?? 0}`} />
        <StatCard label="Discipline" value={formatPercent(avg)} hint="moyenne globale" />
      </div>

      {lowDiscipline.length > 0 && (
        <Card className="mt-5">
          <CardTitle>Joueurs à faible discipline</CardTitle>
          <div className="space-y-2">
            {lowDiscipline.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-danger-soft px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-navy-800">
                  {p.first_name} {p.last_name}
                </span>
                <Badge tone="danger">{formatPercent(p.discipline)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
