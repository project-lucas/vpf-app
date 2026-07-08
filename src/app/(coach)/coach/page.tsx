import Link from "next/link";
import {
  Activity,
  CircleCheck,
  ClipboardList,
  HeartPulse,
  NotebookPen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  averageDiscipline,
  getCoachOverview,
  getPlayersWithDiscipline,
  type ActivityKind,
  type MatchSheetWithPlayer,
  type ReviewWithPlayer,
} from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import { addDays, currentWeekStart, formatAgoFr, formatDateFr } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Dashboard coach — VPF" };
export const dynamic = "force-dynamic";

const ACTIVITY_ICONS: Record<ActivityKind, React.ReactNode> = {
  match: <ClipboardList size={15} />,
  review: <NotebookPen size={15} />,
  session: <CircleCheck size={15} />,
  checkin: <HeartPulse size={15} />,
};

/** Carte compacte d'une feuille de match reçue (toutes les stats saisies). */
function MatchSheetCard({ sheet }: { sheet: MatchSheetWithPlayer }) {
  return (
    <Link
      href={`/coach/joueurs/${sheet.player_id}`}
      className="block rounded-xl bg-navy-50 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-navy-800">
          {sheet.playerName}
          <Badge tone={sheet.is_starter ? "navy" : "neutral"} className="ml-1.5 align-middle">
            {sheet.is_starter ? "Titulaire" : "Remplaçant"}
          </Badge>
        </span>
        <span className="shrink-0 text-lg font-extrabold text-navy-800">
          {sheet.points} <span className="text-xs font-semibold text-navy-400">pts</span>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-navy-400">
        Match du {formatDateFr(sheet.match_date)} · {sheet.minutes} min · {sheet.fouls} faute
        {sheet.fouls > 1 ? "s" : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {[
          { label: "2 pts int.", value: sheet.twos_inside_made },
          { label: "2 pts ext.", value: sheet.twos_outside_made },
          { label: "3 pts", value: sheet.threes_made },
          { label: "LF", value: sheet.free_throws_made },
        ].map((s) => (
          <span
            key={s.label}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              s.value > 0 ? "bg-navy-100 text-navy-600" : "bg-white text-navy-300"
            }`}
          >
            {s.label} ×{s.value}
          </span>
        ))}
      </div>
    </Link>
  );
}

/** Carte compacte d'un bilan hebdo reçu. */
function ReviewCard({ review }: { review: ReviewWithPlayer }) {
  return (
    <Link
      href={`/coach/joueurs/${review.player_id}`}
      className="block rounded-xl bg-navy-50 px-3 py-2.5"
    >
      <p className="text-sm font-semibold text-navy-800">{review.playerName}</p>
      <p className="mt-1 text-xs text-navy-600">
        <span className="font-semibold text-success">Bien fait : </span>
        {review.went_well || "—"}
      </p>
      <p className="mt-0.5 text-xs text-navy-600">
        <span className="font-semibold text-warning">À améliorer : </span>
        {review.to_improve || "—"}
      </p>
    </Link>
  );
}

export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const players = await getPlayersWithDiscipline(supabase);
  const overview = await getCoachOverview(supabase, players);

  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);

  const avg = averageDiscipline(players);
  const lowDiscipline = players.filter(
    (p) => p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
  );
  const emptyPlanning = players.filter((p) => p.planningEmpty);

  // Feuilles de match : semaine en cours / semaine passée + joueurs sans feuille
  const sheetsThisWeek = overview.matchSheets.filter((s) => s.match_date >= weekStart);
  const sheetsLastWeek = overview.matchSheets.filter((s) => s.match_date < weekStart);
  const withSheetThisWeek = new Set(sheetsThisWeek.map((s) => s.player_id));
  const withoutSheetThisWeek = players.filter((p) => !withSheetThisWeek.has(p.id));

  // Bilans hebdo : semaine en cours / semaine passée + joueurs en attente
  const reviewsThisWeek = overview.reviews.filter((r) => r.week_start === weekStart);
  const reviewsLastWeek = overview.reviews.filter((r) => r.week_start === prevWeekStart);
  const withReviewThisWeek = new Set(reviewsThisWeek.map((r) => r.player_id));
  const withReviewLastWeek = new Set(reviewsLastWeek.map((r) => r.player_id));
  const pendingReviewLastWeek = players.filter((p) => !withReviewLastWeek.has(p.id));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Tout ce que tes joueurs remontent, en un coup d'œil." />

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Joueurs actifs" value={`${players.length}`} />
        <StatCard label="Discipline moyenne" value={formatPercent(avg)} hint="sur la semaine" />
        <StatCard
          label="Feuilles de match"
          value={`${withSheetThisWeek.size}/${players.length}`}
          hint="reçues cette semaine"
        />
        <StatCard
          label="Bilans hebdo"
          value={`${withReviewThisWeek.size}/${players.length}`}
          hint="reçus cette semaine"
        />
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

      {/* Feuilles de match : remontées automatiquement dès la saisie du joueur */}
      <Card className="mt-5">
        <CardTitle>Feuilles de match</CardTitle>
        {overview.matchSheets.length === 0 ? (
          <p className="text-sm text-navy-400">
            Aucune feuille de match reçue sur les deux dernières semaines.
          </p>
        ) : (
          <div className="space-y-3">
            {sheetsThisWeek.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
                  Cette semaine
                </p>
                <div className="space-y-1.5">
                  {sheetsThisWeek.map((s) => (
                    <MatchSheetCard key={s.id} sheet={s} />
                  ))}
                </div>
              </div>
            )}
            {sheetsLastWeek.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
                  Semaine passée
                </p>
                <div className="space-y-1.5">
                  {sheetsLastWeek.map((s) => (
                    <MatchSheetCard key={s.id} sheet={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {withoutSheetThisWeek.length > 0 && players.length > 0 && (
          <p className="mt-3 text-xs text-navy-400">
            Sans feuille cette semaine :{" "}
            {withoutSheetThisWeek.map((p) => p.first_name).join(", ")}
          </p>
        )}
      </Card>

      {/* Bilans hebdo : remontés automatiquement dès l'envoi par le joueur */}
      <Card className="mt-5">
        <CardTitle>Bilans de la semaine</CardTitle>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
              Semaine en cours (du {formatDateFr(weekStart)})
            </p>
            {reviewsThisWeek.length === 0 ? (
              <p className="text-sm text-navy-400">
                Aucun bilan reçu pour l&apos;instant — les joueurs le remplissent en fin de
                semaine.
              </p>
            ) : (
              <div className="space-y-1.5">
                {reviewsThisWeek.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
              Semaine passée (du {formatDateFr(prevWeekStart)})
            </p>
            {reviewsLastWeek.length === 0 ? (
              <p className="text-sm text-navy-400">Aucun bilan reçu.</p>
            ) : (
              <div className="space-y-1.5">
                {reviewsLastWeek.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            )}
            {pendingReviewLastWeek.length > 0 && reviewsLastWeek.length > 0 && (
              <p className="mt-2 text-xs text-navy-400">
                Manquants : {pendingReviewLastWeek.map((p) => p.first_name).join(", ")}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Flux : dernières remontées des joueurs, tous types confondus */}
      <Card className="mt-5">
        <CardTitle>Activité récente</CardTitle>
        {overview.activity.length === 0 ? (
          <p className="text-sm text-navy-400">
            Rien pour le moment — les actions de tes joueurs (feuilles de match, bilans,
            séances, check-ins) apparaîtront ici.
          </p>
        ) : (
          <div className="divide-y divide-navy-50">
            {overview.activity.map((a) => (
              <Link key={a.id} href={`/coach/joueurs/${a.playerId}`} className="flex gap-2.5 py-2.5">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    a.kind === "match"
                      ? "bg-navy-800 text-white"
                      : a.kind === "review"
                        ? "bg-warning-soft text-warning"
                        : a.kind === "session"
                          ? "bg-success-soft text-success"
                          : "bg-navy-100 text-navy-500"
                  }`}
                >
                  {ACTIVITY_ICONS[a.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-navy-800">
                      {a.playerName}
                    </span>
                    <span className="shrink-0 text-[11px] text-navy-300">{formatAgoFr(a.at)}</span>
                  </span>
                  <span className="block truncate text-xs text-navy-500">{a.label}</span>
                  {a.detail && (
                    <span className="block truncate text-[11px] text-navy-400">{a.detail}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

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

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-navy-300">
        <Activity size={13} /> Les données remontent automatiquement dès que tes joueurs les
        saisissent.
      </p>
    </>
  );
}
