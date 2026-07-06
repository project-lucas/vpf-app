import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { averageDiscipline, getPlayersWithDiscipline } from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Dashboard coach — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const players = await getPlayersWithDiscipline(supabase);

  const avg = averageDiscipline(players);
  const lowDiscipline = players.filter(
    (p) => p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
  );
  const emptyPlanning = players.filter((p) => p.planningEmpty);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Vue d'ensemble de tes joueurs." />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Joueurs actifs" value={`${players.length}`} />
        <StatCard label="Discipline moyenne" value={formatPercent(avg)} hint="sur la semaine" />
      </div>

      {(emptyPlanning.length > 0 || lowDiscipline.length > 0) && (
        <Card className="mt-5">
          <CardTitle>Alertes</CardTitle>
          <div className="space-y-2">
            {emptyPlanning.map((p) => (
              <Link
                key={`empty-${p.id}`}
                href={`/coach/joueurs/${p.id}`}
                className="flex items-center justify-between rounded-xl bg-warning-soft px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-navy-800">
                  {p.first_name} {p.last_name}
                </span>
                <Badge tone="warning">Planning non rempli</Badge>
              </Link>
            ))}
            {lowDiscipline.map((p) => (
              <Link
                key={`low-${p.id}`}
                href={`/coach/joueurs/${p.id}`}
                className="flex items-center justify-between rounded-xl bg-danger-soft px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-navy-800">
                  {p.first_name} {p.last_name}
                </span>
                <Badge tone="danger">Discipline {formatPercent(p.discipline)}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {lowDiscipline.length === 0 && emptyPlanning.length === 0 && players.length > 0 && (
        <Card className="mt-5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CircleCheck size={15} className="shrink-0" /> Aucune alerte — tous tes joueurs sont
            dans les clous.
          </p>
        </Card>
      )}

      <Card className="mt-5">
        <CardTitle>Discipline par joueur</CardTitle>
        {players.length === 0 ? (
          <p className="text-sm text-navy-400">Aucun joueur actif pour le moment.</p>
        ) : (
          <div className="divide-y divide-navy-50">
            {players.map((p) => (
              <Link
                key={p.id}
                href={`/coach/joueurs/${p.id}`}
                className="flex items-center justify-between py-2.5"
              >
                <span className="text-sm font-semibold text-navy-800">
                  {p.first_name} {p.last_name}
                </span>
                <span
                  className={`text-sm font-bold ${
                    p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
                      ? "text-danger"
                      : "text-navy-800"
                  }`}
                >
                  {formatPercent(p.discipline)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
