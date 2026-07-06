"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import { PLAYER_CATEGORIES, POSITIONS } from "@/lib/constants";
import type { ActionResult, CheckinQuestion } from "@/lib/types";

/** Saisie d'une statistique match — immuable ensuite (aucune modification/suppression). */
export async function addMatchStat(data: {
  match_date: string;
  points: number;
  minutes: number;
  rebounds: number;
  steals: number;
  shots_attempted?: number | null;
  shots_made?: number | null;
  threes_attempted?: number | null;
  threes_made?: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const nums = [data.points, data.minutes, data.rebounds, data.steals];
  if (nums.some((n) => !Number.isInteger(n) || n < 0) || data.minutes > 60 || !data.match_date) {
    return { ok: false, error: "Valeurs invalides." };
  }

  const shooting = [
    data.shots_attempted,
    data.shots_made,
    data.threes_attempted,
    data.threes_made,
  ];
  if (shooting.some((n) => n != null && (!Number.isInteger(n) || n < 0 || n > 200))) {
    return { ok: false, error: "Valeurs de tir invalides." };
  }
  if (
    (data.shots_made != null &&
      data.shots_attempted != null &&
      data.shots_made > data.shots_attempted) ||
    (data.threes_made != null &&
      data.threes_attempted != null &&
      data.threes_made > data.threes_attempted)
  ) {
    return { ok: false, error: "Tirs réussis > tirs tentés : vérifie ta saisie." };
  }

  const { error } = await supabase.from("match_stats").insert({
    player_id: user.id,
    match_date: data.match_date,
    points: data.points,
    minutes: data.minutes,
    rebounds: data.rebounds,
    steals: data.steals,
    shots_attempted: data.shots_attempted ?? null,
    shots_made: data.shots_made ?? null,
    threes_attempted: data.threes_attempted ?? null,
    threes_made: data.threes_made ?? null,
  });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/dashboard");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

/** Bilan hebdomadaire (créé ou mis à jour pour la semaine courante). */
export async function submitWeeklyReview(
  went_well: string,
  to_improve: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase.from("weekly_reviews").upsert(
    {
      player_id: user.id,
      week_start: currentWeekStart(),
      went_well: went_well.trim().slice(0, 2000),
      to_improve: to_improve.trim().slice(0, 2000),
    },
    { onConflict: "player_id,week_start" }
  );
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/dashboard");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("checkins")
    .insert({ player_id: user.id, question, score });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/planning");
  return { ok: true };
}

/** Verdict du joueur sur une séance affectée (fait / pas fait + commentaire). */
export async function markSessionCompletion(
  assignmentId: string,
  status: "done" | "not_done",
  comment: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const cleanScore =
    score === null || Number.isNaN(score) ? null : Math.min(999, Math.max(0, Math.round(score)));

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
  return { ok: true };
}

// L'auto-sélection joueur (addSessionToMyList / removeSessionFromMyList) a été
// retirée : c'est le coach qui décide de la visibilité des séances
// (voir setSessionVisibility dans actions/coach.ts et la migration 0013).
