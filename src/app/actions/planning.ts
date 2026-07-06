"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, addDays } from "@/lib/dates";
import type { ActionResult, CompletionStatus, EventType } from "@/lib/types";

function revalidatePlanning(playerId: string) {
  revalidatePath("/planning");
  revalidatePath("/dashboard");
  revalidatePath(`/coach/joueurs/${playerId}`);
}

/** Ajoute un événement à la semaine type (joueur lui-même, coach référent ou admin — RLS). */
export async function addPlannedEvent(
  playerId: string,
  event: { event_type: EventType; weekday: number; event_time: string; duration_minutes: number }
): Promise<ActionResult> {
  const duration = Math.round(event.duration_minutes);
  if (
    !(event.weekday >= 1 && event.weekday <= 7) ||
    !/^\d{2}:\d{2}/.test(event.event_time) ||
    !(duration >= 5 && duration <= 600)
  ) {
    return { ok: false, error: "Événement invalide." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("planned_events").insert({
    player_id: playerId,
    event_type: event.event_type,
    weekday: event.weekday,
    event_time: event.event_time,
    duration_minutes: duration,
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
  if (
    fields.duration_minutes !== undefined &&
    !(fields.duration_minutes >= 5 && fields.duration_minutes <= 600)
  ) {
    return { ok: false, error: "Durée invalide." };
  }
  const supabase = await createClient();
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

  const { data: existing } = await supabase
    .from("event_completions")
    .select("id")
    .eq("planned_event_id", plannedEventId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("event_completions")
      .update({ status })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Pointage impossible." };
  } else {
    const { error } = await supabase.from("event_completions").insert({
      player_id: user.id,
      planned_event_id: plannedEventId,
      week_start: weekStart,
      event_type: event.event_type,
      weekday: event.weekday,
      event_time: event.event_time,
      // snapshot de la durée configurée au moment du pointage
      duration_minutes: event.duration_minutes ?? null,
      status,
    });
    if (error) return { ok: false, error: "Pointage impossible." };
  }
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
