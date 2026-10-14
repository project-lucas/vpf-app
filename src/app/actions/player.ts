"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { addDays, currentWeekStart, parisNow } from "@/lib/dates";
import {
  PAIN_PUSH_THRESHOLD,
  PLAYER_CATEGORIES,
  POSITIONS,
  REVIEW_HEALTH_LABELS,
  REVIEW_HEALTH_NOTE_MAX_LENGTH,
} from "@/lib/constants";
import { MATCH_WEEKEND_ANSWERS, type MatchWeekendAnswer } from "@/lib/player-gates";
import type { ActionResult, CheckinQuestion, ReviewHealthStatus } from "@/lib/types";

/** Saisie d'une feuille de match — immuable ensuite (aucune modification/suppression). */
export async function addMatchStat(data: {
  match_date: string;
  is_starter: boolean;
  minutes: number;
  threes_made: number;
  twos_inside_made: number;
  twos_outside_made: number;
  free_throws_made: number;
  fouls: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const counts = [
    data.minutes,
    data.threes_made,
    data.twos_inside_made,
    data.twos_outside_made,
    data.free_throws_made,
    data.fouls,
  ];
  if (
    !data.match_date ||
    counts.some((n) => !Number.isInteger(n) || n < 0 || n > 200) ||
    data.minutes > 60
  ) {
    return { ok: false, error: "Valeurs invalides." };
  }
  // un match ne se joue pas dans le futur (il fausserait records et courbe)
  if (data.match_date > parisNow().date) {
    return { ok: false, error: "La date du match est dans le futur." };
  }

  // Source de vérité : points et tirs réussis (hors LF) recalculés côté serveur.
  const shots_made = data.threes_made + data.twos_inside_made + data.twos_outside_made;
  const points =
    3 * data.threes_made +
    2 * (data.twos_inside_made + data.twos_outside_made) +
    data.free_throws_made;

  const { error } = await supabase.from("match_stats").insert({
    player_id: user.id,
    match_date: data.match_date,
    is_starter: data.is_starter,
    minutes: data.minutes,
    points,
    shots_made,
    threes_made: data.threes_made,
    twos_inside_made: data.twos_inside_made,
    twos_outside_made: data.twos_outside_made,
    free_throws_made: data.free_throws_made,
    fouls: data.fouls,
  });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/dashboard");
  // la feuille de match se saisit aussi depuis le planning (pastille + rappel week-end)
  revalidatePath("/planning");
  return { ok: true };
}

/** Le joueur édite son propre profil basket (catégorie, poste, club, objectif). */
export async function updateMyPlayerInfo(data: {
  category: string;
  position: string;
  club: string;
  season_goal: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  if (data.category && !PLAYER_CATEGORIES.includes(data.category as never)) {
    return { ok: false, error: "Catégorie invalide." };
  }
  if (data.position && !POSITIONS.includes(data.position)) {
    return { ok: false, error: "Poste invalide." };
  }

  const { error } = await supabase
    .from("players")
    .update({
      category: data.category || null,
      position: data.position.trim().slice(0, 40),
      club: data.club.trim().slice(0, 80),
      season_goal: data.season_goal.trim().slice(0, 500),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/parametres");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Bilan hebdomadaire, créé ou mis à jour.
 *
 * `weekStart` permet le RATTRAPAGE de la semaine passée. Le rendez-vous est
 * fixé au dimanche 18 h, mais un joueur le remplit souvent le lundi en pensant
 * clore la semaine écoulée : en écrivant systématiquement la semaine courante,
 * on éteignait le rappel du dimanche suivant (le cron le rangeait dans
 * `alreadyDone`) tout en laissant allumée, côté coach, une alerte « bilan
 * manquant » que plus rien ne pouvait résoudre.
 *
 * Deux semaines acceptées, jamais plus : la semaine en cours et la précédente
 * — au-delà, un bilan ne se rattrape pas, il s'invente.
 */
export async function submitWeeklyReview(
  went_well: string,
  to_improve: string,
  health_status: ReviewHealthStatus,
  health_note: string,
  weekStart?: string
): Promise<ActionResult> {
  // la question santé est obligatoire : c'est l'info que le coach attend
  if (!(health_status in REVIEW_HEALTH_LABELS)) {
    return { ok: false, error: "Indique comment va ton corps cette semaine." };
  }
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const thisWeek = currentWeekStart();
  const targetWeek = weekStart ?? thisWeek;
  if (targetWeek !== thisWeek && targetWeek !== addDays(thisWeek, -7)) {
    return { ok: false, error: "Semaine invalide." };
  }

  const { error } = await supabase.from("weekly_reviews").upsert(
    {
      player_id: user.id,
      week_start: targetWeek,
      went_well: went_well.trim().slice(0, 2000),
      to_improve: to_improve.trim().slice(0, 2000),
      health_status,
      health_note:
        health_status === "ok"
          ? ""
          : health_note.trim().slice(0, REVIEW_HEALTH_NOTE_MAX_LENGTH),
    },
    { onConflict: "player_id,week_start" }
  );
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/dashboard");
  // le bilan se remplit depuis le planning (pastille + rappel week-end)
  revalidatePath("/planning");
  return { ok: true };
}

/** Réponse au pop-up (énergie / douleurs) affiché tous les 5 jours. */
export async function submitCheckin(
  question: CheckinQuestion,
  score: number
): Promise<ActionResult> {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return { ok: false, error: "Score invalide." };
  }
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("checkins")
    .insert({ player_id: user.id, question, score });
  if (error) return { ok: false, error: "Enregistrement impossible." };

  if (question === "pain" && score >= PAIN_PUSH_THRESHOLD) {
    await alertCoachOfPain(user.id, score);
  }

  // le check-in vit dans le layout joueur (toutes les pages) : purge globale
  // pour qu'un onglet en cache client ne ré-affiche pas le pop-up
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Douleur élevée déclarée au check-in : le coach référent est prévenu tout de
 * suite, sans attendre qu'il ouvre son tableau de bord. Une blessure qui traîne
 * une semaine coûte une saison.
 *
 * Passe par le service_role : un joueur n'a pas le droit de lire le profil de
 * son coach ni ses subscriptions push. L'insert sous RLS juste au-dessus a
 * prouvé que ce check-in est bien le sien, et rien d'autre n'est exposé.
 * Best-effort : un push qui échoue ne doit pas faire échouer le check-in.
 */
async function alertCoachOfPain(playerId: string, score: number): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: player } = await admin
      .from("players")
      .select("coach_id")
      .eq("id", playerId)
      .maybeSingle();
    if (!player?.coach_id) return;

    const [{ data: coach }, { data: playerProfile }] = await Promise.all([
      admin
        .from("profiles")
        .select("notifications_enabled")
        .eq("id", player.coach_id)
        .maybeSingle(),
      admin.from("profiles").select("first_name, last_name").eq("id", playerId).maybeSingle(),
    ]);
    if (!coach?.notifications_enabled) return;

    const name =
      `${playerProfile?.first_name ?? ""} ${playerProfile?.last_name ?? ""}`.trim() || "Un joueur";
    await sendPushToUser(player.coach_id, {
      title: "Alerte douleur 🩹",
      body: `${name} se note ${score}/10 en douleur au check-in.`,
      url: `/coach/joueurs/${playerId}`,
      kind: "alert",
    });
  } catch {
    // le check-in du joueur est enregistré : l'alerte est un bonus, pas un dû
  }
}

/** Verdict du joueur sur une séance affectée (fait / pas fait + commentaire). */
export async function markSessionCompletion(
  assignmentId: string,
  status: "done" | "not_done",
  comment: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const cleanComment = comment.trim().slice(0, 500);

  const { data: existing } = await supabase
    .from("session_completions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("session_completions")
      .update({ status, comment: cleanComment })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const { error } = await supabase.from("session_completions").insert({
      assignment_id: assignmentId,
      player_id: user.id,
      status,
      comment: cleanComment,
    });
    if (error) return { ok: false, error: "Enregistrement impossible." };
  }
  revalidatePath("/seances");
  // les séances validées nourrissent XP, badges et courbe du dashboard
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Score du joueur au challenge noté d'une séance programme (ex. 8/10).
 * Saisir un score implique d'avoir fait la séance : si aucun verdict n'existe
 * encore, la réalisation est créée avec le statut "done".
 */
export async function saveChallengeScore(
  assignmentId: string,
  score: number | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // borne au max du challenge de la séance (« 999/10 » impossible)
  const { data: assignmentRow } = await supabase
    .from("session_assignments")
    .select("session:library_sessions!inner(challenge)")
    .eq("id", assignmentId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (!assignmentRow) return { ok: false, error: "Séance introuvable." };
  const sessionRow = Array.isArray(assignmentRow.session)
    ? assignmentRow.session[0]
    : assignmentRow.session;
  const maxScore =
    (sessionRow?.challenge as { maxScore?: number } | null)?.maxScore ?? 999;

  const cleanScore =
    score === null || Number.isNaN(score)
      ? null
      : Math.min(maxScore, Math.max(0, Math.round(score)));

  const { data: existing } = await supabase
    .from("session_completions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("session_completions")
      .update({ challenge_score: cleanScore })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const { error } = await supabase.from("session_completions").insert({
      assignment_id: assignmentId,
      player_id: user.id,
      status: "done",
      comment: "",
      challenge_score: cleanScore,
    });
    if (error) return { ok: false, error: "Enregistrement impossible." };
  }
  revalidatePath("/seances");
  revalidatePath("/dashboard");
  return { ok: true };
}

// L'auto-sélection joueur (addSessionToMyList / removeSessionFromMyList) a été
// retirée : c'est le coach qui décide de la visibilité des séances
// (voir setSessionVisibility dans actions/coach.ts et la migration 0013).

/**
 * La réponse du joueur au pop-up de feuille de match du week-end (0044) :
 * « je n'ai pas joué », « mon match est demain », « pas de match ce
 * week-end ». Une ligne par semaine, la réponse du dimanche remplace celle du
 * samedi. Seule la semaine en cours se répond : c'est le week-end qu'on
 * demande, pas après.
 */
export async function answerMatchWeekend(
  weekStart: string,
  answer: MatchWeekendAnswer
): Promise<ActionResult> {
  if (!MATCH_WEEKEND_ANSWERS.includes(answer)) return { ok: false, error: "Réponse invalide." };
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };
  if (weekStart !== currentWeekStart()) {
    return { ok: false, error: "Ce week-end n'est plus à renseigner." };
  }

  const { error } = await supabase
    .from("match_weekend_answers")
    .upsert({ player_id: user.id, week_start: weekStart, answer }, { onConflict: "player_id,week_start" });
  if (error) return { ok: false, error: "Enregistrement impossible." };

  revalidatePath("/planning");
  revalidatePath("/dashboard");
  return { ok: true };
}
