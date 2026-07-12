import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HeartPulse, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import { averageDiscipline, getPlayersWithDiscipline } from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { AVAILABILITY_LABELS, LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { currentWeekStart } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeftIcon } from "@/components/icons";
import { EditCoachButton } from "./EditCoachButton";
import { DeleteCoachButton } from "./DeleteCoachButton";
import { CoachInvitations } from "@/components/coach/CoachInvitations";
import { ArchivePlayerButton, ReactivatePlayerButton } from "./PlayerArchiveControls";
import type { Invitation } from "@/lib/types";

export const metadata = { title: "Fiche coach — VPF" };
export const dynamic = "force-dynamic";

interface HealthEntry {
  energy: number | null;
  pain: number | null;
}

export default async function ClubCoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") redirect("/coach");

  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const { data: coach } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, whatsapp_number, role")
    .eq("id", id)
    .in("role", ["coach", "admin"])
    .maybeSingle();
  if (!coach) notFound();

  const [players, { data: archivedRaw }, { data: invitations }] = await Promise.all([
    getPlayersWithDiscipline(supabase, id),
    supabase
      .from("players")
      .select("id, profile:profiles!players_id_fkey(first_name, last_name)")
      .eq("coach_id", id)
      .eq("status", "archived"),
    supabase
      .from("invitations")
      .select("*")
      .eq("coach_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const playerIds = players.map((p) => p.id);
  const usedByIds = ((invitations ?? []) as Invitation[])
    .map((i) => i.used_by)
    .filter((v): v is string => Boolean(v));

  const [{ data: reviews }, { data: checkinRows }, { data: usedByProfiles }] = await Promise.all([
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
          .select("player_id, question, score")
          .in("player_id", playerIds)
          .order("created_at", { ascending: false })
          .limit(200),
    usedByIds.length === 0
      ? { data: [] }
      : supabase.from("profiles").select("id, first_name, last_name").in("id", usedByIds),
  ]);

  const withReview = new Set((reviews ?? []).map((r) => r.player_id));

  // dernier check-in énergie / douleurs de chaque joueur
  const health = new Map<string, HealthEntry>();
  for (const c of checkinRows ?? []) {
    const entry = health.get(c.player_id) ?? { energy: null, pain: null };
    const key = c.question === "energy" ? "energy" : "pain";
    if (entry[key] === null) entry[key] = c.score;
    health.set(c.player_id, entry);
  }

  const archived = (archivedRaw ?? [])
    .map((p) => {
      const pr = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      return {
        id: p.id,
        name: `${pr?.first_name ?? ""} ${pr?.last_name ?? ""}`.trim() || "(profil incomplet)",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const usedByNames = new Map(
    (usedByProfiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  );
  const invitationRows = ((invitations ?? []) as Invitation[]).map((inv) => ({
    ...inv,
    used_by_name: inv.used_by ? (usedByNames.get(inv.used_by) ?? "Joueur") : null,
  }));

  const coachName = `${coach.first_name} ${coach.last_name}`.trim() || "(profil incomplet)";
  const availablePlayers = players.filter((p) => p.availability === "available");

  return (
    <>
      <Link
        href="/coach/club"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-500"
      >
        <ChevronLeftIcon size={16} /> Staff
      </Link>

      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={coachName}
          subtitle={
            coach.whatsapp_number ? `WhatsApp : ${coach.whatsapp_number}` : "WhatsApp non renseigné"
          }
        />
        <div className="flex shrink-0 flex-col items-end gap-2">
          <EditCoachButton
            coach={{
              id: coach.id,
              first_name: coach.first_name,
              last_name: coach.last_name,
              whatsapp_number: coach.whatsapp_number,
            }}
          />
          {coach.role === "coach" && (
            <DeleteCoachButton
              coachId={coach.id}
              coachName={coachName}
              playerCount={players.length + archived.length}
            />
          )}
        </div>
      </div>
      {coach.role === "admin" && (
        <Badge tone="navy" className="-mt-2 mb-4">
          Admin
        </Badge>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Joueurs actifs" value={`${players.length}`} />
        <StatCard label="Discipline" value={formatPercent(averageDiscipline(players))} />
        <StatCard
          label="Bilans hebdo"
          value={`${availablePlayers.filter((p) => withReview.has(p.id)).length}/${availablePlayers.length}`}
          hint="cette semaine"
        />
      </div>

      <Card className="mt-5">
        <CardTitle>Joueurs</CardTitle>
        {players.length === 0 ? (
          <p className="text-sm text-navy-400">Aucun joueur actif pour ce coach.</p>
        ) : (
          <div className="divide-y divide-navy-50">
            {players.map((p) => {
              const h = health.get(p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <Link href={`/coach/joueurs/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy-800">
                      {p.first_name} {p.last_name}
                      {p.availability !== "available" && (
                        <Badge
                          tone={p.availability === "injured" ? "danger" : "neutral"}
                          className="ml-1.5 align-middle"
                        >
                          {AVAILABILITY_LABELS[p.availability]}
                        </Badge>
                      )}
                      {p.planningEmpty && p.availability === "available" && (
                        <Badge tone="warning" className="ml-1.5 align-middle">
                          Planning vide
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <Badge
                        tone={
                          p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
                            ? "danger"
                            : "neutral"
                        }
                      >
                        {formatPercent(p.discipline)}
                      </Badge>
                      <Badge tone={h?.energy != null && h.energy <= 4 ? "warning" : "neutral"}>
                        <Zap size={11} /> {h?.energy != null ? `${h.energy}/10` : "—"}
                      </Badge>
                      <Badge tone={h?.pain != null && h.pain >= 5 ? "danger" : "neutral"}>
                        <HeartPulse size={11} /> {h?.pain != null ? `${h.pain}/10` : "—"}
                      </Badge>
                    </span>
                  </Link>
                  <ArchivePlayerButton
                    playerId={p.id}
                    playerName={`${p.first_name} ${p.last_name}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-5">
        <CoachInvitations
          coachId={coach.id}
          invitations={invitationRows}
          appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
        />
      </div>

      {archived.length > 0 && (
        <Card className="mt-5">
          <CardTitle>Joueurs archivés ({archived.length})</CardTitle>
          <div className="divide-y divide-navy-50">
            {archived.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <p className="text-sm font-semibold text-navy-800">{p.name}</p>
                <ReactivatePlayerButton playerId={p.id} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
