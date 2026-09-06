import Link from "next/link";
import {
  Activity,
  CircleCheck,
  ClipboardList,
  HeartPulse,
  MessageCircle,
  NotebookPen,
  Zap,
} from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import {
  averageDiscipline,
  getCoachOverview,
  getHealthByPlayer,
  getPlayersWithDiscipline,
  type ActivityKind,
  type MatchSheetWithPlayer,
  type ReviewWithPlayer,
} from "@/lib/coach-data";
import { formatPercent } from "@/lib/discipline";
import {
  AVAILABILITY_LABELS,
  LOW_DISCIPLINE_THRESHOLD,
  REVIEW_HEALTH_LABELS,
} from "@/lib/constants";
import { addDays, currentWeekStart, formatAgoFr, formatDateFr, parisNow } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatStrip } from "@/components/ui/StatStrip";
import { Card, CardTitle } from "@/components/ui/Card";
import { Section, SectionTitle } from "@/components/ui/Section";
import { Row } from "@/components/ui/Row";
import { Badge } from "@/components/ui/Badge";
import { DisclosureBar } from "@/components/ui/DisclosureBar";
import { ReviewReplyBox } from "@/components/coach/ReviewReplyBox";
import { SelectionsLink } from "@/components/coach/SelectionsLink";
import { getStaffInbox, getStaffUnreadPlayerIds } from "@/lib/conversations";
import {
  buildPlayerAlerts,
  getSessionCoverage,
  rankAlertRows,
  type PlayerAlert,
  type PlayerAlertRow,
} from "@/lib/alerts";
import { getNavRole } from "@/lib/auth";
import { PushPrompt } from "@/components/PushPrompt";

export const metadata = { title: "Dashboard coach — VPF" };
export const dynamic = "force-dynamic";

const ACTIVITY_ICONS: Record<ActivityKind, React.ReactNode> = {
  match: <ClipboardList size={15} />,
  review: <NotebookPen size={15} />,
  session: <CircleCheck size={15} />,
  checkin: <HeartPulse size={15} />,
};

/** Feuille de match reçue : le score en évidence, le détail en une ligne. */
function MatchSheetRow({ sheet }: { sheet: MatchSheetWithPlayer }) {
  const detail = [
    { label: "2 int.", value: sheet.twos_inside_made },
    { label: "2 ext.", value: sheet.twos_outside_made },
    { label: "3 pts", value: sheet.threes_made },
    { label: "LF", value: sheet.free_throws_made },
  ]
    .filter((s) => s.value > 0)
    .map((s) => `${s.label} ×${s.value}`)
    .join(" · ");

  return (
    <Row
      href={`/coach/joueurs/${sheet.player_id}`}
      title={
        <span className="flex items-center gap-1.5">
          <span className="truncate">{sheet.playerName}</span>
          <Badge tone={sheet.is_starter ? "navy" : "neutral"}>
            {sheet.is_starter ? "Titulaire" : "Remplaçant"}
          </Badge>
        </span>
      }
      subtitle={`${formatDateFr(sheet.match_date)} · ${sheet.minutes} min · ${sheet.fouls} faute${
        sheet.fouls > 1 ? "s" : ""
      }${detail ? ` · ${detail}` : ""}`}
      right={
        <span className="text-lg font-extrabold tabular-nums text-navy-900">
          {sheet.points}
          <span className="ml-0.5 text-xs font-semibold text-navy-400">pts</span>
        </span>
      }
    />
  );
}

/** Bilan hebdo reçu, avec la réponse du coach — c'est une action, pas une lecture. */
function ReviewCard({ review }: { review: ReviewWithPlayer }) {
  return (
    <div className="rounded-xl bg-navy-50 px-3 py-2.5">
      <Link
        href={`/coach/joueurs/${review.player_id}?onglet=semaine`}
        className="text-sm font-semibold text-navy-800 hover:underline"
      >
        {review.playerName}
      </Link>
      <p className="mt-1 text-xs text-navy-600">
        <span className="font-semibold text-success">Bien fait : </span>
        {review.went_well || "—"}
      </p>
      <p className="mt-0.5 text-xs text-navy-600">
        <span className="font-semibold text-warning">À améliorer : </span>
        {review.to_improve || "—"}
      </p>
      {/* Question santé (0032) — absente des bilans antérieurs */}
      {review.health_status && (
        <p className="mt-0.5 text-xs text-navy-600">
          <span
            className={`font-semibold ${
              review.health_status === "ok" ? "text-success" : "text-danger"
            }`}
          >
            Santé : {REVIEW_HEALTH_LABELS[review.health_status]}
          </span>
          {review.health_note ? ` — ${review.health_note}` : ""}
        </p>
      )}
      <ReviewReplyBox reviewId={review.id} initialReply={review.coach_reply} />
    </div>
  );
}

/**
 * Une alerte du récap : puce teintée, rouge = maintenant, orange = cette
 * semaine. C'est l'exception assumée à « une pilule par ligne » : ici la ligne
 * EST un cumul, et c'est le nombre de puces qui dit l'urgence d'un joueur.
 */
function AlertChip({ alert }: { alert: PlayerAlert }) {
  const tone =
    alert.severity === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning";
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${tone}`}
    >
      {alert.label}
    </span>
  );
}

/** Une ligne du récap : le joueur, son coach si ce n'est pas moi, ses alertes. */
function AlertRowView({
  row,
  coachFirstName,
}: {
  row: PlayerAlertRow;
  coachFirstName: string | null;
}) {
  const { player, alerts } = row;
  return (
    <Row
      href={`/coach/joueurs/${player.id}?onglet=${alerts[0].tab}`}
      dot={row.critical}
      emphasis={row.critical}
      wrap
      title={
        <span className="flex items-center gap-1.5">
          <span className="truncate">
            {player.first_name} {player.last_name}
          </span>
          {coachFirstName && (
            <span className="shrink-0 text-[11px] font-semibold text-navy-400">
              · {coachFirstName}
            </span>
          )}
        </span>
      }
      subtitle={
        <span className="flex flex-wrap gap-1">
          {alerts.map((a) => (
            <AlertChip key={a.key} alert={a} />
          ))}
        </span>
      }
    />
  );
}

/**
 * Accueil du staff : une file d'attente, pas un rapport.
 *
 * Visible d'entrée — ce qui demande une action aujourd'hui : « À savoir »
 * (une ligne par joueur qui cumule ses alertes, cf. `src/lib/alerts.ts`) et
 * les bilans à répondre. Tout ce qui se consulte (santé, feuilles de match,
 * discipline par joueur, activité) est derrière une barre d'icônes : à un tap,
 * mais plus jamais cinq écrans à faire défiler.
 *
 * Périmètre : les chiffres et panneaux portent sur MES joueurs (filtre
 * `coach_id`). Le récap « À savoir », lui, couvre **tout le club pour un
 * admin** — c'est lui la référence de tous les joueurs, perf et formation ; le
 * prénom du coach référent accompagne alors les joueurs d'un collègue.
 */
export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const isAdmin = (await getNavRole()) === "admin";
  // le périmètre du récap : tout le club pour un admin, ses joueurs pour un
  // coach (la RLS ne lui rend rien d'autre de toute façon)
  const scopePlayers = await getPlayersWithDiscipline(supabase, isAdmin ? undefined : user?.id);
  const scopeIds = scopePlayers.map((p) => p.id);
  // filtre coach_id explicite : chiffres et panneaux ne portent QUE sur mes joueurs
  const players = scopePlayers.filter((p) => p.coach_id === user?.id);
  const playerIds = players.map((p) => p.id);

  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);

  const coachIds = [...new Set(scopePlayers.map((p) => p.coach_id))].filter(
    (id) => id !== user?.id
  );

  const [
    overview,
    health,
    { data: profile },
    inboxThreads,
    unreadPlayerIds,
    coverage,
    { data: lastWeekReviews },
    { data: coachProfiles },
  ] = await Promise.all([
    getCoachOverview(supabase, players),
    getHealthByPlayer(supabase, scopeIds),
    user
      ? supabase.from("profiles").select("notifications_enabled").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user ? getStaffInbox(supabase, user.id, isAdmin, scopeIds) : Promise.resolve([]),
    user
      ? getStaffUnreadPlayerIds(supabase, user.id, scopeIds)
      : Promise.resolve(new Set<string>()),
    getSessionCoverage(supabase, scopeIds),
    scopeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("weekly_reviews")
          .select("player_id")
          .eq("week_start", prevWeekStart)
          .in("player_id", scopeIds),
    coachIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("profiles").select("id, first_name").in("id", coachIds),
  ]);

  // le compteur du tableau d'affichage reste sur MES fils
  const unreadThreads = inboxThreads.filter(
    (t) => t.hasUnread && playerIds.includes(t.playerId)
  ).length;

  // ---- le récap : une ligne par joueur, ses alertes cumulées
  const lastMessageByPlayer = new Map<string, string>();
  for (const t of inboxThreads) {
    if (!t.lastAt) continue;
    const cur = lastMessageByPlayer.get(t.playerId);
    if (!cur || t.lastAt > cur) lastMessageByPlayer.set(t.playerId, t.lastAt);
  }
  const withLastWeekReview = new Set((lastWeekReviews ?? []).map((r) => r.player_id));
  const coachFirstName = new Map(
    (coachProfiles ?? []).map((c) => [c.id as string, c.first_name as string])
  );
  const nowIso = new Date().toISOString();

  const alertRows = rankAlertRows(
    scopePlayers.map((p) => {
      const alerts = buildPlayerAlerts({
        player: p,
        hasUnread: unreadPlayerIds.has(p.id),
        health: health.get(p.id) ?? null,
        coverage: coverage.get(p.id) ?? null,
        lastMessageAt: lastMessageByPlayer.get(p.id) ?? null,
        hasLastWeekReview: withLastWeekReview.has(p.id),
        nowIso,
      });
      return { player: p, alerts, critical: alerts.some((a) => a.severity === "danger") };
    })
  );
  const criticalCount = alertRows.filter((r) => r.critical).length;
  const messageCount = alertRows.filter((r) => r.alerts.some((a) => a.key === "message")).length;

  // Les joueurs blessés / en vacances sortent des moyennes, alertes et listes
  // « manquants » : leur absence est connue, elle ne doit pas polluer le suivi.
  const availablePlayers = players.filter((p) => p.availability === "available");
  const awayPlayers = players.filter((p) => p.availability !== "available");

  const avg = averageDiscipline(players);
  const lowDiscipline = availablePlayers.filter(
    (p) => p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD
  );

  // Alerte douleur : score >= 5 sur un check-in de moins de 7 jours
  const painAlertLimit = addDays(parisNow().date, -7);
  const painAlerts = players.filter((p) => {
    const pain = health.get(p.id)?.pain;
    return pain !== null && pain !== undefined && pain.score >= 5 && pain.at >= painAlertLimit;
  });

  const sheetsThisWeek = overview.matchSheets.filter((s) => s.match_date >= weekStart);
  const sheetsLastWeek = overview.matchSheets.filter((s) => s.match_date < weekStart);
  const withSheetThisWeek = new Set(sheetsThisWeek.map((s) => s.player_id));
  const withoutSheetThisWeek = availablePlayers.filter((p) => !withSheetThisWeek.has(p.id));

  const reviewsThisWeek = overview.reviews.filter((r) => r.week_start === weekStart);
  const reviewsLastWeek = overview.reviews.filter((r) => r.week_start === prevWeekStart);
  const withReviewThisWeek = new Set(reviewsThisWeek.map((r) => r.player_id));
  const withReviewLastWeek = new Set(reviewsLastWeek.map((r) => r.player_id));
  const pendingReviewLastWeek = availablePlayers.filter((p) => !withReviewLastWeek.has(p.id));

  const todoCount = alertRows.length;

  return (
    <>
      <PageHeader
        title="Accueil"
        subtitle={
          todoCount > 0
            ? `${todoCount} joueur${todoCount > 1 ? "s" : ""} à regarder${
                criticalCount > 0
                  ? ` · ${criticalCount} urgent${criticalCount > 1 ? "s" : ""}`
                  : ""
              }.`
            : "Rien en attente — tout est dans les clous."
        }
        action={<SelectionsLink />}
      />

      <StatStrip
        items={[
          // les messages reçus d'abord : c'est le chiffre qu'on vient chercher
          {
            label: "Messages",
            value: `${unreadThreads}`,
            hint: unreadThreads > 0 ? "à lire" : "tout est lu",
            tone: unreadThreads > 0 ? "danger" : "default",
          },
          { label: "Joueurs", value: `${players.length}` },
          {
            label: "Discipline",
            value: formatPercent(avg),
            tone: avg !== null && avg < LOW_DISCIPLINE_THRESHOLD ? "warning" : "default",
          },
          { label: "Feuilles", value: `${withSheetThisWeek.size}/${players.length}` },
          { label: "Bilans", value: `${withReviewThisWeek.size}/${players.length}` },
        ]}
      />

      {/* ---- Ce qui se consulte : en haut, à un tap, derrière une icône.
          Le panneau s'ouvre sous la barre et repousse « À traiter » — c'est
          voulu : on regarde, on referme, la file revient. ---- */}
      <DisclosureBar
        className="mt-4"
        items={[
          {
            key: "sante",
            icon: <HeartPulse size={16} />,
            label: "Santé",
            count: painAlerts.length,
            content: (
              <Section>
                {players.length === 0 ? (
                  <p className="text-sm text-navy-400">Aucun joueur actif pour le moment.</p>
                ) : (
                  <div>
                    {players.map((p) => {
                      const h = health.get(p.id);
                      const last = h?.pain?.at ?? h?.energy?.at;
                      return (
                        <Row
                          key={p.id}
                          href={`/coach/joueurs/${p.id}`}
                          title={
                            <span className="flex items-center gap-1.5">
                              <span className="truncate">
                                {p.first_name} {p.last_name}
                              </span>
                              {p.availability !== "available" && (
                                <Badge tone={p.availability === "injured" ? "danger" : "neutral"}>
                                  {AVAILABILITY_LABELS[p.availability]}
                                </Badge>
                              )}
                            </span>
                          }
                          subtitle={last ? `Dernier check-in ${formatAgoFr(last)}` : "Aucun check-in"}
                          right={
                            <span className="flex items-center gap-2 text-xs font-bold tabular-nums">
                              <span className={h?.energy && h.energy.score <= 4 ? "text-warning" : "text-navy-600"}>
                                <Zap size={11} className="-mt-0.5 mr-0.5 inline" />
                                {h?.energy ? `${h.energy.score}/10` : "—"}
                              </span>
                              <span className={h?.pain && h.pain.score >= 5 ? "text-danger" : "text-navy-600"}>
                                <HeartPulse size={11} className="-mt-0.5 mr-0.5 inline" />
                                {h?.pain ? `${h.pain.score}/10` : "—"}
                              </span>
                            </span>
                          }
                        />
                      );
                    })}
                  </div>
                )}
                {awayPlayers.length > 0 && (
                  <p className="mt-2 text-[11px] text-navy-400">
                    {awayPlayers
                      .map((p) => `${p.first_name} (${AVAILABILITY_LABELS[p.availability].toLowerCase()})`)
                      .join(", ")}{" "}
                    — série et discipline gelées, hors moyennes et alertes.
                  </p>
                )}
              </Section>
            ),
          },
          {
            key: "feuilles",
            icon: <ClipboardList size={16} />,
            label: "Matchs",
            count: sheetsThisWeek.length,
            content: (
              <Section>
                {overview.matchSheets.length === 0 ? (
                  <p className="text-sm text-navy-400">
                    Aucune feuille de match reçue sur les deux dernières semaines.
                  </p>
                ) : (
                  <div>
                    {sheetsThisWeek.length > 0 && (
                      <SectionTitle className="mb-1">Cette semaine</SectionTitle>
                    )}
                    {sheetsThisWeek.map((s) => (
                      <MatchSheetRow key={s.id} sheet={s} />
                    ))}
                    {sheetsLastWeek.length > 0 && (
                      <SectionTitle className="mb-1 mt-3">Semaine passée</SectionTitle>
                    )}
                    {sheetsLastWeek.map((s) => (
                      <MatchSheetRow key={s.id} sheet={s} />
                    ))}
                  </div>
                )}
                {withoutSheetThisWeek.length > 0 && players.length > 0 && (
                  <p className="mt-2 text-[11px] text-navy-400">
                    Sans feuille cette semaine : {withoutSheetThisWeek.map((p) => p.first_name).join(", ")}
                  </p>
                )}
              </Section>
            ),
          },
          {
            key: "discipline",
            icon: <Activity size={16} />,
            label: "Discipline",
            count: lowDiscipline.length,
            content: (
              <Section>
                {players.length === 0 ? (
                  <p className="text-sm text-navy-400">Aucun joueur actif pour le moment.</p>
                ) : (
                  <div>
                    {[...players]
                      .sort((a, b) => (a.discipline ?? 2) - (b.discipline ?? 2))
                      .map((p) => (
                        <Row
                          key={p.id}
                          href={`/coach/joueurs/${p.id}?onglet=semaine`}
                          title={`${p.first_name} ${p.last_name}`}
                          subtitle={p.planningEmpty ? "Planning non rempli" : undefined}
                          right={
                            <span
                              className={`text-sm font-extrabold tabular-nums ${
                                p.discipline === null
                                  ? "text-navy-300"
                                  : p.discipline < LOW_DISCIPLINE_THRESHOLD
                                    ? "text-danger"
                                    : "text-navy-900"
                              }`}
                            >
                              {formatPercent(p.discipline)}
                            </span>
                          }
                        />
                      ))}
                  </div>
                )}
              </Section>
            ),
          },
          {
            key: "activite",
            icon: <Zap size={16} />,
            label: "Activité",
            content: (
              <Section>
                {overview.activity.length === 0 ? (
                  <p className="text-sm text-navy-400">
                    Rien pour le moment — les actions de tes joueurs (feuilles de match, bilans,
                    séances, check-ins) apparaîtront ici.
                  </p>
                ) : (
                  <div>
                    {overview.activity.map((a) => (
                      <Row
                        key={a.id}
                        href={`/coach/joueurs/${a.playerId}`}
                        title={
                          <span className="flex items-center gap-2">
                            <span className="text-navy-400">{ACTIVITY_ICONS[a.kind]}</span>
                            <span className="truncate">{a.playerName}</span>
                          </span>
                        }
                        subtitle={`${a.label}${a.detail ? ` · ${a.detail}` : ""}`}
                        right={<span className="text-[11px] text-navy-400">{formatAgoFr(a.at)}</span>}
                      />
                    ))}
                  </div>
                )}
              </Section>
            ),
          },
        ]}
      />

      {/* ---- À savoir : la seule boîte rouge de la page. Une ligne par
          joueur, ses alertes cumulées ; les joueurs sans alerte n'y sont pas. ---- */}
      <Card
        tone={criticalCount > 0 ? "danger" : todoCount > 0 ? "warning" : "default"}
        className="mt-5"
      >
        <CardTitle>
          À savoir
          {messageCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 align-middle text-[11px] font-extrabold normal-case tracking-normal text-white">
              <MessageCircle size={11} className="mr-0.5" /> {messageCount}
            </span>
          )}
          {isAdmin && scopePlayers.length > players.length && (
            <span className="ml-2 align-middle text-[11px] font-semibold normal-case tracking-normal text-navy-400">
              tout le club
            </span>
          )}
        </CardTitle>
        {alertRows.length === 0 ? (
          <p className="text-sm text-navy-400">
            Tout va bien : messages lus, plannings remplis, séances en place, personne en douleur.
          </p>
        ) : (
          <div>
            {alertRows.map((row) => (
              <AlertRowView
                key={row.player.id}
                row={row}
                coachFirstName={
                  row.player.coach_id !== user?.id
                    ? (coachFirstName.get(row.player.coach_id) ?? "Autre coach")
                    : null
                }
              />
            ))}
          </div>
        )}
      </Card>

      {/* ---- Bilans : répondre est une action, ça reste visible ---- */}
      <Section
        className="mt-6"
        title="Bilans hebdo"
        action={
          <span className="text-[11px] text-navy-400">
            {reviewsThisWeek.length}/{players.length} reçus cette semaine
          </span>
        }
      >
        {reviewsThisWeek.length === 0 && reviewsLastWeek.length === 0 ? (
          <p className="text-sm text-navy-400">
            Aucun bilan reçu — les joueurs le remplissent le dimanche soir.
          </p>
        ) : (
          <div className="space-y-2">
            {reviewsThisWeek.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {reviewsLastWeek.length > 0 && (
              <>
                <p className="pt-1 text-[10px] font-bold uppercase tracking-wide text-navy-400">
                  Semaine passée · du {formatDateFr(prevWeekStart)}
                </p>
                {reviewsLastWeek.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </>
            )}
          </div>
        )}
        {pendingReviewLastWeek.length > 0 && reviewsLastWeek.length > 0 && (
          <p className="mt-2 text-xs text-navy-400">
            Manquants la semaine passée : {pendingReviewLastWeek.map((p) => p.first_name).join(", ")}
          </p>
        )}
      </Section>

      {unreadThreads > 0 && (
        <p className="mt-6 text-center text-xs text-navy-400">
          {unreadThreads} fil{unreadThreads > 1 ? "s" : ""} en attente dans{" "}
          <Link href="/coach/joueurs" className="font-bold text-navy-700 underline">
            Joueurs
          </Link>
          .
        </p>
      )}

      {/* Autorisation push demandée sur l'écran d'accueil du staff (celui où
          l'on atterrit après connexion). */}
      <PushPrompt
        notificationsEnabled={profile?.notifications_enabled ?? true}
        title="Active tes notifications"
        description="Messages des joueurs et des parents, alertes douleur."
      />
    </>
  );
}
