"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, addDays, parisNow } from "@/lib/dates";
import { HABIT_COLORS, HABIT_ICON_NAMES } from "@/lib/constants";
import type { ActionResult, CompletionStatus, EventType, HabitColor } from "@/lib/types";

/** Heure valide "HH:MM" (00-23 / 00-59), suivie au plus de ":SS". */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function revalidatePlanning(playerId: string) {
  revalidatePath("/planning");
  revalidatePath("/dashboard");
  revalidatePath(`/coach/joueurs/${playerId}`);
}

/** Ajoute un événement à la semaine type (joueur lui-même, coach référent ou admin — RLS). */
export async function addPlannedEvent(
  playerId: string,
  event: {
    event_type: EventType;
    weekday: number;
    event_time: string;
    duration_minutes: number;
    /** activité perso (event_type = "autre") : nom + icône lucide + clé couleur */
    custom_name?: string;
    custom_icon?: string;
    custom_color?: string;
  }
): Promise<ActionResult> {
  const duration = Math.round(event.duration_minutes);
  if (
    !(event.weekday >= 1 && event.weekday <= 7) ||
    !TIME_RE.test(event.event_time) ||
    !(duration >= 5 && duration <= 600)
  ) {
    return { ok: false, error: "Événement invalide." };
  }

  // Activité perso : nom obligatoire, icône/couleur ramenées aux valeurs connues
  let customName = "";
  let customIcon = "";
  let customColor = "";
  if (event.event_type === "autre") {
    customName = (event.custom_name ?? "").trim().slice(0, 40);
    if (!customName) return { ok: false, error: "Donne un nom à ton activité." };
    customIcon = (HABIT_ICON_NAMES as readonly string[]).includes(event.custom_icon ?? "")
      ? (event.custom_icon as string)
      : "flame";
    customColor = Object.keys(HABIT_COLORS).includes(event.custom_color ?? "")
      ? (event.custom_color as HabitColor)
      : "red";
  }

  const supabase = await createClient();

  // Règle : pas deux événements à la même heure le même jour.
  const targetTime = event.event_time.slice(0, 5);
  const { data: sameDay } = await supabase
    .from("planned_events")
    .select("event_time")
    .eq("player_id", playerId)
    .eq("weekday", event.weekday);
  if ((sameDay ?? []).some((e) => String(e.event_time).slice(0, 5) === targetTime)) {
    return { ok: false, error: "Un événement est déjà prévu à cette heure ce jour-là." };
  }

  const { error } = await supabase.from("planned_events").insert({
    player_id: playerId,
    event_type: event.event_type,
    weekday: event.weekday,
    event_time: event.event_time,
    duration_minutes: duration,
    custom_name: customName,
    custom_icon: customIcon,
    custom_color: customColor,
  });
  if (error) return { ok: false, error: "Ajout impossible." };
  revalidatePlanning(playerId);
  return { ok: true };
}

export async function updatePlannedEvent(
  eventId: string,
  playerId: string,
  fields: {
    event_type?: EventType;
    weekday?: number;
    event_time?: string;
    duration_minutes?: number;
  }
): Promise<ActionResult> {
  // Reconstruction champ par champ : mêmes validations que l'ajout, et aucune
  // colonne hors whitelist ne peut passer via un payload forgé.
  const patch: {
    event_type?: EventType;
    weekday?: number;
    event_time?: string;
    duration_minutes?: number;
  } = {};
  if (fields.duration_minutes !== undefined) {
    const duration = Math.round(fields.duration_minutes);
    if (!(duration >= 5 && duration <= 600)) return { ok: false, error: "Durée invalide." };
    patch.duration_minutes = duration;
  }
  if (fields.weekday !== undefined) {
    if (!(fields.weekday >= 1 && fields.weekday <= 7)) {
      return { ok: false, error: "Événement invalide." };
    }
    patch.weekday = fields.weekday;
  }
  if (fields.event_time !== undefined) {
    if (!TIME_RE.test(fields.event_time)) return { ok: false, error: "Heure invalide." };
    patch.event_time = fields.event_time;
  }
  if (fields.event_type !== undefined) patch.event_type = fields.event_type;
  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = await createClient();

  // Règle anti-doublon horaire si l'heure ou le jour change.
  if (fields.weekday !== undefined || fields.event_time !== undefined) {
    const { data: current } = await supabase
      .from("planned_events")
      .select("weekday, event_time")
      .eq("id", eventId)
      .maybeSingle();
    const targetWeekday = fields.weekday ?? current?.weekday;
    const targetTime = (fields.event_time ?? current?.event_time ?? "").slice(0, 5);
    if (targetWeekday != null && targetTime) {
      const { data: sameDay } = await supabase
        .from("planned_events")
        .select("event_time")
        .eq("player_id", playerId)
        .eq("weekday", targetWeekday)
        .neq("id", eventId);
      if ((sameDay ?? []).some((e) => String(e.event_time).slice(0, 5) === targetTime)) {
        return { ok: false, error: "Un événement est déjà prévu à cette heure ce jour-là." };
      }
    }
  }

  const { error } = await supabase.from("planned_events").update(fields).eq("id", eventId);
  if (error) return { ok: false, error: "Modification impossible." };
  revalidatePlanning(playerId);
  return { ok: true };
}

export async function deletePlannedEvent(eventId: string, playerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_events").delete().eq("id", eventId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePlanning(playerId);
  return { ok: true };
}

/**
 * Copie la semaine type d'un joueur vers un autre (action groupée coach) :
 * REMPLACE tous les événements du joueur cible par ceux du joueur source.
 * L'autorisation repose sur la RLS : la lecture de la source et l'écriture de
 * la cible n'aboutissent que si l'appelant est le coach référent (ou l'admin)
 * des deux joueurs. L'historique des pointages du joueur cible survit
 * (planned_event_id passe à null, les snapshots restent).
 */
export async function copyWeekTemplate(
  fromPlayerId: string,
  toPlayerId: string
): Promise<ActionResult> {
  if (fromPlayerId === toPlayerId) return { ok: false, error: "Choisis un autre joueur." };
  const supabase = await createClient();

  const { data: source, error: readError } = await supabase
    .from("planned_events")
    .select(
      "event_type, weekday, event_time, duration_minutes, custom_name, custom_icon, custom_color"
    )
    .eq("player_id", fromPlayerId);
  if (readError) return { ok: false, error: "Lecture impossible." };
  if (!source || source.length === 0) {
    return { ok: false, error: "La semaine type de ce joueur est vide." };
  }

  // Insertion AVANT suppression : si l'une des deux étapes échoue, le joueur
  // cible garde une semaine exploitable (au pire des doublons temporaires),
  // jamais une semaine vidée sans copie.
  const { data: previous, error: prevError } = await supabase
    .from("planned_events")
    .select("id")
    .eq("player_id", toPlayerId);
  if (prevError) return { ok: false, error: "Remplacement impossible." };

  const { error: insertError } = await supabase
    .from("planned_events")
    .insert(source.map((e) => ({ ...e, player_id: toPlayerId })));
  if (insertError) return { ok: false, error: "Copie impossible." };

  const previousIds = (previous ?? []).map((e) => e.id);
  if (previousIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("planned_events")
      .delete()
      .in("id", previousIds);
    if (deleteError) return { ok: false, error: "Copie faite, mais l'ancienne semaine n'a pas pu être retirée — réessaie." };
  }

  revalidatePlanning(toPlayerId);
  return { ok: true };
}

/**
 * Pointage d'un événement (fait / pas fait) par le joueur, pour la semaine
 * courante ou la semaine précédente (rattrapage). Les détails de l'événement
 * sont copiés en snapshot pour que l'historique survive aux modifications de
 * la semaine type. Une réalisation ne peut jamais être supprimée, seulement
 * modifiée (statut + commentaire).
 */
export async function checkEvent(
  plannedEventId: string,
  weekStart: string,
  status: CompletionStatus
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const thisWeek = currentWeekStart();
  if (weekStart !== thisWeek && weekStart !== addDays(thisWeek, -7)) {
    return { ok: false, error: "Cette semaine n'est plus modifiable." };
  }

  const { data: event } = await supabase
    .from("planned_events")
    .select("*")
    .eq("id", plannedEventId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (!event) return { ok: false, error: "Événement introuvable." };

  // Un jour futur ne se pointe pas (l'UI le bloque, le serveur aussi :
  // sinon un appel forgé validerait toute la semaine dès le lundi)
  if (addDays(weekStart, event.weekday - 1) > parisNow().date) {
    return { ok: false, error: "Ce jour n'est pas encore passé." };
  }

  // Pas d'upsert ici : ON CONFLICT DO UPDATE exigerait le privilège UPDATE sur
  // toutes les colonnes du snapshot, or le grant client est limité à
  // (status, comment) — l'upsert échouait en 42501 et le pointage revenait.
  // À la place : insert ignoré si la ligne existe (ignoreDuplicates → ON
  // CONFLICT DO NOTHING, aucun privilège UPDATE requis), puis update du statut
  // seul. Deux pointages rapprochés (✓ puis ✗) restent sûrs — le dernier gagne.
  const { error: insertError } = await supabase.from("event_completions").upsert(
    {
      player_id: user.id,
      planned_event_id: plannedEventId,
      week_start: weekStart,
      event_type: event.event_type,
      weekday: event.weekday,
      event_time: event.event_time,
      // snapshot de la durée configurée au moment du pointage
      duration_minutes: event.duration_minutes ?? null,
      // snapshot de l'activité perso (nom/icône/couleur) — l'historique et le
      // suivi cumulatif du dashboard survivent aux modifs de la semaine type
      custom_name: event.custom_name ?? "",
      custom_icon: event.custom_icon ?? "",
      custom_color: event.custom_color ?? "",
      status,
    },
    { onConflict: "planned_event_id,week_start", ignoreDuplicates: true }
  );
  if (insertError) return { ok: false, error: "Pointage impossible." };

  const { error: updateError } = await supabase
    .from("event_completions")
    .update({ status })
    .eq("planned_event_id", plannedEventId)
    .eq("week_start", weekStart)
    .eq("player_id", user.id);
  if (updateError) return { ok: false, error: "Pointage impossible." };
  revalidatePlanning(user.id);
  return { ok: true };
}

/** Commentaire optionnel du joueur sur une réalisation. */
export async function setCompletionComment(
  completionId: string,
  comment: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("event_completions")
    .update({ comment: comment.trim().slice(0, 500) })
    .eq("id", completionId)
    .eq("player_id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePlanning(user.id);
  return { ok: true };
}
