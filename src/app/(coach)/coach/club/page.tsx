import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, HeartPulse } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import { averageDiscipline, getPlayersWithDiscipline } from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { addDays, currentWeekStart, parisNow } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateCoachButton } from "./CreateCoachButton";

export const metadata = { title: "Club — VPF" };
export const dynamic = "force-dynamic";

interface StaffRow {
  id: string;
  name: string;
  isAdmin: boolean;
  playersCount: number;
  discipline: number | null;
  reviewsReceived: number;
  reviewsExpected: number;
  painAlerts: number;
  emptyPlannings: number;
  lowDiscipline: number;
  alertCount: number;
}

export default async function ClubPage() {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") redirect("/coach");

  const supabase = await createClient();
  const weekStart = currentWeekStart();

  // Tout le staff encadre des joueurs : les coachs comme les deux admins
  const [{ data: staff }, players] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("role", ["coach", "admin"])
      .order("first_name"),
    getPlayersWithDiscipline(supabase),
  ]);

  const playerIds = players.map((p) => p.id);
  const painAlertLimit = addDays(parisNow().date, -7);

  const [{ data: reviews }, { data: painCheckins }] = await Promise.all([
    playerIds.length === 0
      ? { data: [] }
      : supabase
          .from("weekly_reviews")
          .select("player_id")
          .eq("week_start", weekStart)
          .in("player_id", playerIds),
    playerIds.length === 0
      ? { data: [] }
      : supabase
          .from("checkins")
          .select("player_id, score, created_at")
          .eq("question", "pain")
          .gte("created_at", painAlertLimit)
          .in("player_id", playerIds)
          .order("created_at", { ascending: false }),
  ]);

  const withReview = new Set((reviews ?? []).map((r) => r.player_id));
  // alerte douleur = DERNIER check-in douleur (moins de 7 jours) à 5 ou plus
  const lastPain = new Map<string, number>();
  for (const c of painCheckins ?? []) {
    if (!lastPain.has(c.player_id)) lastPain.set(c.player_id, c.score);
  }

  const rows: StaffRow[] = (staff ?? []).map((s) => {
    const own = players.filter((p) => p.coach_id === s.id);
    const available = own.filter((p) => p.availability === "available");
    const painAlerts = own.filter((p) => (lastPain.get(p.id) ?? 0) >= 5).length;
    const emptyPlannings = available.filter((p) => p.planningEmpty).length;
    const lowDiscipline = available.filter(
      (p) => p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
    ).length;
    return {
      id: s.id,
      name: `${s.first_name} ${s.last_name}`.trim() || "(profil incomplet)",
      isAdmin: s.role === "admin",
      playersCount: own.length,
      discipline: averageDiscipline(own),
      reviewsReceived: available.filter((p) => withReview.has(p.id)).length,
      reviewsExpected: available.length,
      painAlerts,
      emptyPlannings,
      lowDiscipline,
      alertCount: painAlerts + emptyPlannings + lowDiscipline,
    };
  });

  // les coachs qui demandent l'attention remontent en premier
  rows.sort((a, b) => b.alertCount - a.alertCount || a.name.localeCompare(b.name, "fr"));

  return (
    <>
      <PageHeader
        title="Club"
        subtitle="L'essentiel sur chaque coach et ses joueurs, en un coup d'œil."
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Coachs" value={`${rows.length}`} />
        <StatCard label="Joueurs actifs" value={`${players.length}`} />
        <StatCard
          label="Discipline"
          value={formatPercent(averageDiscipline(players))}
          hint="moyenne club"
        />
      </div>

      <div className="mt-5">
        <CreateCoachButton />
      </div>

      {rows.length === 0 ? (
        <EmptyState>Aucun coach pour le moment.</EmptyState>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <Link key={r.id} href={`/coach/club/${r.id}`} className="block">
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-bold text-navy-900">
                    {r.name}
                    {r.isAdmin && (
                      <Badge tone="navy" className="ml-1.5 align-middle">
                        Admin
                      </Badge>
                    )}
                  </p>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-navy-400">
                    {r.playersCount} joueur{r.playersCount > 1 ? "s" : ""}
                    <ChevronRight size={15} />
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge
                    tone={
                      r.discipline !== null && r.discipline < LOW_DISCIPLINE_THRESHOLD
                        ? "danger"
                        : "neutral"
                    }
                  >
                    Discipline {formatPercent(r.discipline)}
                  </Badge>
                  <Badge tone={r.reviewsReceived < r.reviewsExpected ? "warning" : "success"}>
                    Bilans {r.reviewsReceived}/{r.reviewsExpected}
                  </Badge>
                  {r.painAlerts > 0 && (
                    <Badge tone="danger">
                      <HeartPulse size={11} /> {r.painAlerts} douleur{r.painAlerts > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {r.emptyPlannings > 0 && (
                    <Badge tone="warning">
                      {r.emptyPlannings} planning{r.emptyPlannings > 1 ? "s" : ""} vide
                      {r.emptyPlannings > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {r.lowDiscipline > 0 && (
                    <Badge tone="danger">
                      {r.lowDiscipline} discipline{r.lowDiscipline > 1 ? "s" : ""} faible
                      {r.lowDiscipline > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {r.alertCount === 0 && r.playersCount > 0 && (
                    <Badge tone="success">Aucune alerte</Badge>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
