import { redirect } from "next/navigation";
import { HeartPulse, Megaphone, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import { averageDiscipline, getPlayersWithDiscipline } from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { addDays, currentWeekStart, parisNow } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatStrip } from "@/components/ui/StatStrip";
import { Section } from "@/components/ui/Section";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { DisclosureBar } from "@/components/ui/DisclosureBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateCoachButton } from "./CreateCoachButton";
import { AnnouncementsManager } from "./AnnouncementsManager";
import type { Announcement } from "@/lib/types";

export const metadata = { title: "Staff — VPF" };
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

/**
 * Supervision du club (admins) : un coach par ligne, ceux qui demandent
 * l'attention en premier. Les annonces et la création d'un coach — gestes
 * rares — sont derrière deux icônes en haut, plus au milieu de la page.
 */
export default async function ClubPage() {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") redirect("/coach");

  const supabase = await createClient();
  const weekStart = currentWeekStart();

  // Tout le staff encadre des joueurs : les coachs comme les deux admins
  const [{ data: staff }, players, { data: announcements }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("role", ["coach", "admin"])
      .order("first_name"),
    getPlayersWithDiscipline(supabase),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
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
  const totalAlerts = rows.reduce((s, r) => s + r.alertCount, 0);
  const clubDiscipline = averageDiscipline(players);

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle={
          totalAlerts > 0
            ? `${totalAlerts} point${totalAlerts > 1 ? "s" : ""} d'attention dans le club.`
            : "Le club en un coup d'œil."
        }
      />

      <StatStrip
        items={[
          { label: "Coachs", value: `${rows.length}` },
          { label: "Joueurs", value: `${players.length}` },
          {
            label: "Discipline",
            value: formatPercent(clubDiscipline),
            hint: "moyenne club",
            tone:
              clubDiscipline !== null && clubDiscipline < LOW_DISCIPLINE_THRESHOLD
                ? "warning"
                : "default",
          },
        ]}
      />

      <DisclosureBar
        className="mt-4"
        items={[
          {
            key: "annonces",
            icon: <Megaphone size={16} />,
            label: "Annonces",
            count: (announcements ?? []).length,
            content: <AnnouncementsManager announcements={(announcements ?? []) as Announcement[]} />,
          },
          {
            key: "coach",
            icon: <UserPlus size={16} />,
            label: "Nouveau coach",
            content: <CreateCoachButton />,
          },
        ]}
      />

      <Section className="mt-6" title="Coachs">
        {rows.length === 0 ? (
          <EmptyState>Aucun coach pour le moment.</EmptyState>
        ) : (
          <div>
            {rows.map((r) => {
              const details = [
                `${r.playersCount} joueur${r.playersCount > 1 ? "s" : ""}`,
                `Discipline ${formatPercent(r.discipline)}`,
                `Bilans ${r.reviewsReceived}/${r.reviewsExpected}`,
              ];
              const alerts = [
                r.painAlerts > 0 ? `${r.painAlerts} douleur${r.painAlerts > 1 ? "s" : ""}` : null,
                r.emptyPlannings > 0
                  ? `${r.emptyPlannings} planning${r.emptyPlannings > 1 ? "s" : ""} vide${r.emptyPlannings > 1 ? "s" : ""}`
                  : null,
                r.lowDiscipline > 0
                  ? `${r.lowDiscipline} discipline${r.lowDiscipline > 1 ? "s" : ""} faible${r.lowDiscipline > 1 ? "s" : ""}`
                  : null,
              ].filter(Boolean);

              return (
                <Row
                  key={r.id}
                  href={`/coach/club/${r.id}`}
                  dot={r.alertCount > 0}
                  emphasis={r.alertCount > 0}
                  title={
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{r.name}</span>
                      {r.isAdmin && <Badge tone="navy">Admin</Badge>}
                    </span>
                  }
                  subtitle={
                    <>
                      {details.join(" · ")}
                      {alerts.length > 0 && (
                        <span className="font-semibold text-danger"> · {alerts.join(", ")}</span>
                      )}
                    </>
                  }
                  right={
                    r.alertCount > 0 ? (
                      <Badge tone="danger">
                        <HeartPulse size={11} /> {r.alertCount}
                      </Badge>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
