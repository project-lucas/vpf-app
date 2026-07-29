import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getParentChild } from "@/lib/parent-data";
import { canUseHygiene } from "@/lib/offers";
import { computeHygieneAverages, formatHours, HYGIENE_CRITERIA } from "@/lib/hygiene";
import { formatDateFr } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { HygieneRadar } from "@/components/hygiene/HygieneRadar";
import type { HygieneLog } from "@/lib/types";

export const metadata = { title: "Hygiène — VPF" };
export const dynamic = "force-dynamic";

export default async function ParentHygienePage() {
  const child = await getParentChild();
  // écran de l'offre formation uniquement — même règle que côté joueur
  if (!child || !canUseHygiene(child.offer)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("hygiene_logs")
    .select("*")
    .eq("player_id", child.playerId)
    .order("log_date", { ascending: false });

  const logs = (data ?? []) as HygieneLog[];
  const averages = computeHygieneAverages(logs);

  return (
    <>
      <PageHeader
        title="Hygiène de vie"
        subtitle={`Sommeil, hydratation et nutrition de ${child.firstName} — saisis par lui, jour après jour.`}
      />

      {averages.days === 0 ? (
        <EmptyState>
          {child.firstName} n&apos;a pas encore rempli sa fiche hygiène de vie.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="Sommeil moyen" value={formatHours(averages.sleepHours)} />
            <StatCard label="Jours saisis" value={`${averages.days}`} />
          </div>

          <Card className="mt-4">
            <CardTitle>Moyennes nutrition</CardTitle>
            <HygieneRadar averages={averages} />
          </Card>

          <Card className="mt-4">
            <CardTitle>Derniers jours</CardTitle>
            <div className="divide-y divide-navy-50">
              {logs.slice(0, 10).map((log) => (
                <div key={log.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-navy-800">
                      {formatDateFr(log.log_date)}
                    </span>
                    <span className="text-sm font-bold text-navy-800">
                      {formatHours(Number(log.sleep_hours))}{" "}
                      <span className="text-xs font-medium text-navy-400">de sommeil</span>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {HYGIENE_CRITERIA.map((c) => (
                      <span
                        key={c.key}
                        className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-500"
                      >
                        {c.label} {log[c.key]}/5
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
