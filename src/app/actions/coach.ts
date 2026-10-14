"use server";

import { weekdaysLabel } from "@/lib/weekdays";

import { revalidatePath } from "next/cache";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffProfile } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { parisNow } from "@/lib/dates";
import { logStaffAction } from "@/lib/journal";
import {
  AVAILABILITY_LABELS,
  REVIEW_REPLY_MAX_LENGTH,
  VISIBLE_NOTE_MAX_LENGTH,
} from "@/lib/constants";
import { OFFER_LABELS, toOffer } from "@/lib/offers";
import type { ActionResult, PlayerAvailability, PlayerOffer, SessionPole } from "@/lib/types";

function revalidatePlayer(playerId: string) {
  revalidatePath(`/coach/joueurs/${playerId}`);
  revalidatePath("/coach/joueurs");
  revalidatePath("/coach");
  revalidatePath("/seances");
}

/** « Théo Martin » pour le journal du staff (service_role : la RLS a déjà tranché). */
async function playerLabel(playerId: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", playerId)
    .maybeSingle();
  return `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim() || "un joueur";
}

/** Modification du profil joueur par le coach référent ou l'admin (RLS). */
export async function updatePlayerProfile(
  playerId: string,
  data: {
    first_name: string;
    last_name: string;
    /** numéro WhatsApp du joueur, saisi par son coach (contact direct) */
    whatsapp_number: string;
    position: string;
    club: string;
    birthdate: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    season_goal: string;
    /** offre souscrite : pilote les écrans visibles côté joueur (0026) */
    offer: PlayerOffer;
  }
): Promise<ActionResult> {
  const supabase = await createClient();

  const offerResult = await setPlayerOffer(playerId, data.offer);
  if (!offerResult.ok) return offerResult;

  // whatsapp_number est dans le column grant de profiles (0002) et la policy
  // profiles_update autorise le coach référent : pas de service_role ici.
  const { error: e1 } = await supabase
    .from("profiles")
    .update({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      whatsapp_number: data.whatsapp_number.trim(),
    })
    .eq("id", playerId);

  const { error: e2 } = await supabase
    .from("players")
    .update({
      position: data.position,
      club: data.club.trim(),
      birthdate: data.birthdate || null,
      height_cm: data.height_cm,
      weight_kg: data.weight_kg,
      season_goal: data.season_goal.trim(),
    })
    .eq("id", playerId);

  if (e1 || e2) return { ok: false, error: "Modification impossible." };
  revalidatePlayer(playerId);
  return { ok: true };
}

/**
 * Offre du joueur (perf / formation) : décidée par le coach, jamais par le
 * joueur — d'où l'écriture en service_role (aucun grant client sur la colonne,
 * migration 0026), précédée d'une lecture sous RLS qui vaut autorisation.
 *
 * Changer d'offre ne touche AUCUNE donnée : les écrans réservés à l'offre
 * formation disparaissent ou réapparaissent, l'historique du joueur (hygiène,
 * objectifs, progression) reste intact dans les deux sens.
 */
export async function setPlayerOffer(
  playerId: string,
  offer: PlayerOffer
): Promise<ActionResult> {
  const clean = toOffer(offer);
  // staff d'abord : depuis 0031, la lecture RLS ci-dessous réussit aussi pour
  // les parents du joueur (voir requireStaffProfile)
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  // puis lecture sous RLS : ne renvoie une ligne que si l'utilisateur est le
  // coach référent (joueur actif) ou l'admin
  const { data: row } = await supabase
    .from("players")
    .select("id, offer")
    .eq("id", playerId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Joueur introuvable." };
  if (row.offer === clean) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin.from("players").update({ offer: clean }).eq("id", playerId);
  if (error) return { ok: false, error: "Changement d'offre impossible." };

  await logStaffAction({
    actorId: guard.userId,
    playerId,
    action: "player_offer",
    summary: `a passé ${await playerLabel(playerId)} en offre ${OFFER_LABELS[clean]}`,
  });
  revalidatePlayer(playerId);
  // les écrans du joueur changent de contenu (onglet Hygiène, carte Objectifs)
  revalidatePath("/hygiene");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Synchronise la visibilité d'une séance : les joueurs cochés la voient,
 * les décochés ne la voient plus (soft-delete, l'historique survit).
 * `managedPlayerIds` = les joueurs gérés par le coach connecté ; seuls eux
 * sont touchés par la synchronisation.
 */
export async function setSessionVisibility(
  sessionId: string,
  checkedPlayerIds: string[],
  managedPlayerIds: string[],
  /** jours du programme appliqués aux joueurs nouvellement cochés (0035) */
  weekdays: number[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: current, error: readError } = await supabase
    .from("session_assignments")
    .select("id, player_id")
    .eq("session_id", sessionId)
    .in("player_id", managedPlayerIds)
    .is("removed_at", null);
  if (readError) return { ok: false, error: "Lecture impossible." };

  const currentIds = new Set((current ?? []).map((a) => a.player_id));
  const checked = new Set(checkedPlayerIds);

  const toAdd = managedPlayerIds.filter((id) => checked.has(id) && !currentIds.has(id));
  const toRemove = (current ?? []).filter((a) => !checked.has(a.player_id));

  const addResult = await assignSession(sessionId, toAdd, weekdays);
  if (!addResult.ok && toAdd.length > 0) return addResult;

  for (const a of toRemove) {
    const result = await removeAssignment(a.id, a.player_id);
    if (!result.ok) return result;
  }

  revalidatePath("/coach/bibliotheque");
  return { ok: true };
}

/**
 * Affecte une séance de la bibliothèque à un ou plusieurs joueurs, sur un ou
 * plusieurs jours (1 = lundi … 7 = dimanche, migration 0035).
 *
 * Chaque jour est une affectation à part entière — donc un pointage à part :
 * une routine « chaque jour » se coche sept fois par semaine, une technique
 * « lundi et jeudi » deux fois. C'est le modèle de 0035 (`session_completions`
 * référence l'affectation, pas la séance) ; rien à migrer. Au moins un jour
 * est obligatoire : une séance sans jour n'apparaît dans aucun onglet.
 */
export async function assignSession(
  sessionId: string,
  playerIds: string[],
  weekdays: number[]
): Promise<ActionResult> {
  if (playerIds.length === 0) return { ok: true };
  const days = [...new Set(weekdays)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (days.length === 0) return { ok: false, error: "Choisis au moins un jour." };

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // joueurs réellement nouvellement affectés : eux seuls seront prévenus
  const newlyAssigned: string[] = [];

  for (const playerId of playerIds) {
    // anti-doublon PAR JOUR : la séance peut vivre plusieurs jours, mais pas
    // deux fois le même (double-clic, ré-affectation).
    const { data: existing } = await supabase
      .from("session_assignments")
      .select("weekday")
      .eq("player_id", playerId)
      .eq("session_id", sessionId)
      .is("removed_at", null);
    const taken = new Set((existing ?? []).map((a) => a.weekday));
    const toInsert = days.filter((d) => !taken.has(d));
    if (toInsert.length === 0) continue;

    const { data: maxRow } = await supabase
      .from("session_assignments")
      .select("order_index")
      .eq("player_id", playerId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base = maxRow?.order_index ?? 0;

    const { error } = await supabase.from("session_assignments").insert(
      toInsert.map((weekday, i) => ({
        session_id: sessionId,
        player_id: playerId,
        assigned_by: user.id,
        weekday,
        order_index: base + i + 1,
      }))
    );
    if (error) {
      // le message Postgres dit la vraie cause (RLS, contrainte, colonne) :
      // sans lui, « Affectation impossible » ne se diagnostique pas
      console.error("[assignSession] insert refusé", {
        sessionId,
        playerId,
        days: toInsert,
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: `Affectation impossible : ${error.message}` };
    }
    newlyAssigned.push(playerId);
    revalidatePlayer(playerId);
  }
  revalidatePath("/coach/bibliotheque");

  if (newlyAssigned.length > 0) {
    const { data: assigned } = await supabase
      .from("library_sessions")
      .select("name")
      .eq("id", sessionId)
      .maybeSingle();
    await Promise.all(
      newlyAssigned.map(async (playerId) =>
        logStaffAction({
          actorId: user.id,
          playerId,
          action: "session_assign",
          summary: `a affecté « ${assigned?.name ?? "une séance"} » à ${await playerLabel(playerId)} (${weekdaysLabel(days)})`,
        })
      )
    );
  }

  // Sans push, le joueur ne découvrait la séance qu'en ouvrant l'app de
  // lui-même. Envoyé après la boucle et en parallèle : l'affectation est déjà
  // enregistrée, une notification qui traîne ne doit pas retarder la réponse.
  // Les doublons ignorés plus haut ne déclenchent rien — pas de relance.
  if (newlyAssigned.length > 0) {
    const { data: session } = await supabase
      .from("library_sessions")
      .select("name")
      .eq("id", sessionId)
      .maybeSingle();
    await Promise.all(
      newlyAssigned.map((playerId) =>
        pushToPlayerIfEnabled(playerId, {
          title: "Nouvelle séance de ton coach 🏀",
          // les jours situent la séance dans la semaine dès la notification
          body: session?.name
            ? `${session.name} — ${weekdaysLabel(days)}.`
            : `Une nouvelle séance t'attend (${weekdaysLabel(days)}).`,
          url: `/seances?jour=${days[0]}`,
        })
      )
    );
  }

  return { ok: true };
}

/** Retire une séance affectée : elle disparaît côté joueur, l'historique est conservé. */
export async function removeAssignment(
  assignmentId: string,
  playerId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_assignments")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) {
    console.error("[removeAssignment] update refusé", { assignmentId, playerId, code: error.code, message: error.message });
    return { ok: false, error: `Retrait impossible : ${error.message}` };
  }
  revalidatePlayer(playerId);
  return { ok: true };
}

/**
 * Déplace une séance affectée sur un autre jour du programme (0035). Sert
 * aussi à ranger les séances d'avant la migration restées sans jour.
 */
export async function setAssignmentWeekday(
  assignmentId: string,
  playerId: string,
  weekday: number
): Promise<ActionResult> {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return { ok: false, error: "Jour invalide." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_assignments")
    .update({ weekday })
    .eq("id", assignmentId)
    .eq("player_id", playerId);
  if (error) return { ok: false, error: "Changement de jour impossible." };
  revalidatePlayer(playerId);
  return { ok: true };
}

/** Réordonne les séances affectées d'un joueur (liste complète ordonnée). */
export async function reorderAssignments(
  playerId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("session_assignments")
      .update({ order_index: i + 1 })
      .eq("id", orderedIds[i])
      .eq("player_id", playerId);
    if (error) return { ok: false, error: "Réorganisation impossible." };
  }
  revalidatePlayer(playerId);
  return { ok: true };
}

/** Note visible par le joueur (une note actuelle par pôle, 80 caractères max). */
export async function setVisibleNote(
  playerId: string,
  pole: SessionPole,
  content: string
): Promise<ActionResult> {
  const clean = content.trim().slice(0, VISIBLE_NOTE_MAX_LENGTH);
  const supabase = await createClient();

  if (!clean) {
    const { error } = await supabase
      .from("visible_notes")
      .delete()
      .eq("player_id", playerId)
      .eq("pole", pole);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const { error } = await supabase
      .from("visible_notes")
      .upsert({ player_id: playerId, pole, content: clean }, { onConflict: "player_id,pole" });
    if (error) return { ok: false, error: "Enregistrement impossible." };
  }
  revalidatePlayer(playerId);
  return { ok: true };
}

/** Focus de la semaine écrit par le coach — affiché en tête du planning joueur. */
export async function setWeekFocus(playerId: string, content: string): Promise<ActionResult> {
  const clean = content.trim().slice(0, 200);
  const supabase = await createClient();

  if (!clean) {
    const { error } = await supabase.from("coach_focus").delete().eq("player_id", playerId);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const { error } = await supabase
      .from("coach_focus")
      .upsert(
        { player_id: playerId, content: clean, updated_at: new Date().toISOString() },
        { onConflict: "player_id" }
      );
    if (error) return { ok: false, error: "Enregistrement impossible." };
  }
  revalidatePlayer(playerId);
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * Disponibilité du joueur (blessé / vacances / disponible). Réservé au coach
 * référent et à l'admin ; écrit via service_role car aucun grant client
 * n'existe sur ces colonnes (le joueur ne peut pas geler sa propre série).
 */
export async function setPlayerAvailability(
  playerId: string,
  availability: PlayerAvailability
): Promise<ActionResult> {
  // staff d'abord : depuis 0031, la lecture RLS ci-dessous réussit aussi pour
  // les parents du joueur (voir requireStaffProfile)
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  // puis lecture sous RLS : ne renvoie une ligne que si l'utilisateur est le
  // coach référent (joueur actif) ou l'admin
  const { data: row } = await supabase
    .from("players")
    .select("id, availability")
    .eq("id", playerId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Joueur introuvable." };

  const admin = createAdminClient();
  // availability_since porte toujours la date du changement : début d'absence
  // quand le joueur devient indisponible, date de RETOUR quand il redevient
  // disponible. Le cron s'en sert comme borne basse de la clôture quotidienne :
  // les jours d'absence ne sont jamais matérialisés en not_done, la série
  // survit à la blessure / aux vacances.
  const { error } = await admin
    .from("players")
    .update({
      availability,
      availability_since: parisNow().date,
    })
    .eq("id", playerId);
  if (error) return { ok: false, error: "Enregistrement impossible." };

  if (row.availability !== availability) {
    await logStaffAction({
      actorId: guard.userId,
      playerId,
      action: "player_availability",
      summary: `a passé ${await playerLabel(playerId)} en « ${AVAILABILITY_LABELS[availability]} »`,
    });
  }
  revalidatePlayer(playerId);
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * Réponse du coach au bilan hebdo d'un joueur. L'autorisation passe par la
 * lecture RLS (le coach ne voit que les bilans de ses joueurs) ; l'écriture par
 * le service_role, les clients n'ayant aucun droit d'écriture sur coach_reply.
 * Le joueur reçoit un push à la première réponse (pas sur les corrections).
 */
export async function setReviewReply(reviewId: string, content: string): Promise<ActionResult> {
  const clean = content.trim().slice(0, REVIEW_REPLY_MAX_LENGTH);
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: review } = await supabase
    .from("weekly_reviews")
    .select("id, player_id, coach_reply")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { ok: false, error: "Bilan introuvable." };
  if (review.player_id === user.id) return { ok: false, error: "Réservé au coach." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("weekly_reviews")
    .update({
      coach_reply: clean,
      coach_reply_at: clean ? new Date().toISOString() : null,
    })
    .eq("id", reviewId);
  if (error) return { ok: false, error: "Enregistrement impossible." };

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, notifications_enabled")
    .eq("id", review.player_id)
    .maybeSingle();
  if (clean) {
    await logStaffAction({
      actorId: user.id,
      playerId: review.player_id,
      action: "review_reply",
      summary: `${review.coach_reply ? "a corrigé sa réponse au" : "a répondu au"} bilan de ${
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "un joueur"
      }`,
    });
  }

  if (clean && !review.coach_reply) {
    if (profile?.notifications_enabled) {
      await sendPushToUser(review.player_id, {
        title: "Réponse de ton coach 💬",
        body: clean.length > 120 ? `${clean.slice(0, 117)}…` : clean,
        url: "/planning",
        // même vibration que la messagerie : c'est le coach qui s'adresse au joueur
        kind: "message",
      });
    }
  }

  revalidatePlayer(review.player_id);
  revalidatePath("/planning");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Objectifs mesurables (fixés par le coach, jauge visible par le joueur)
// ---------------------------------------------------------------------------

/** Push au joueur si ses notifications sont activées. */
async function pushToPlayerIfEnabled(
  playerId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("notifications_enabled")
    .eq("id", playerId)
    .maybeSingle();
  if (profile?.notifications_enabled) await sendPushToUser(playerId, payload);
}

export async function addPlayerGoal(
  playerId: string,
  data: { title: string; target_value: number; unit: string; deadline: string | null }
): Promise<ActionResult> {
  const title = data.title.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Donne un titre à l'objectif." };
  if (!(data.target_value > 0)) return { ok: false, error: "Cible invalide." };

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // RLS : seuls le coach référent et l'admin peuvent insérer
  const { error } = await supabase.from("player_goals").insert({
    player_id: playerId,
    title,
    target_value: data.target_value,
    unit: data.unit.trim().slice(0, 16),
    deadline: data.deadline || null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: "Création impossible." };

  await pushToPlayerIfEnabled(playerId, {
    title: "Nouvel objectif 🎯",
    body: title,
    url: "/dashboard",
  });
  revalidatePlayer(playerId);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Mise à jour de la progression ; push au joueur quand l'objectif est atteint. */
export async function updatePlayerGoalProgress(
  goalId: string,
  playerId: string,
  currentValue: number
): Promise<ActionResult> {
  if (!(currentValue >= 0)) return { ok: false, error: "Valeur invalide." };
  const supabase = await createClient();

  const { data: goal } = await supabase
    .from("player_goals")
    .select("title, target_value, achieved_at")
    .eq("id", goalId)
    .maybeSingle();
  if (!goal) return { ok: false, error: "Objectif introuvable." };

  const justAchieved = goal.achieved_at === null && currentValue >= Number(goal.target_value);
  const { error } = await supabase
    .from("player_goals")
    .update({
      current_value: currentValue,
      ...(justAchieved ? { achieved_at: new Date().toISOString() } : {}),
    })
    .eq("id", goalId);
  if (error) return { ok: false, error: "Enregistrement impossible." };

  if (justAchieved) {
    await pushToPlayerIfEnabled(playerId, {
      title: "Objectif atteint 🏆",
      body: goal.title,
      url: "/dashboard",
    });
  }
  revalidatePlayer(playerId);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePlayerGoal(goalId: string, playerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("player_goals").delete().eq("id", goalId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePlayer(playerId);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Note privée (visible uniquement par le coach référent et l'admin). */
export async function addCoachNote(playerId: string, content: string): Promise<ActionResult> {
  const clean = content.trim();
  if (!clean) return { ok: false, error: "La note est vide." };
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("coach_notes")
    .insert({ player_id: playerId, author_id: user.id, content: clean.slice(0, 2000) });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true };
}

export async function deleteCoachNote(noteId: string, playerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("coach_notes").delete().eq("id", noteId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true };
}
