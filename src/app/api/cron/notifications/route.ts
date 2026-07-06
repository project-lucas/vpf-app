import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { addDays, parisNow, timeToMinutes } from "@/lib/dates";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import type { EventType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Route cron — à appeler toutes les 10 minutes (Vercel Cron ou cron-job.org).
 * Toute la logique horaire est calculée en Europe/Paris, quel que soit le
 * fuseau du serveur (robuste au changement d'heure été/hiver).
 *
 * 1. Rappel push 30 min avant chaque événement du planning (tous types).
 * 2. Dimanche 18h45 : rappel du bilan hebdomadaire.
 * 3. Dès le lundi midi : clôture de la semaine précédente — matérialise les
 *    événements non pointés en "not_done" et fige le résumé hebdomadaire
 *    (weekly_summaries). C'est la "nouvelle semaine de suivi" automatique.
 *
 * La table notification_log (contrainte UNIQUE) garantit qu'aucun rappel
 * n'est envoyé deux fois, même si deux exécutions se chevauchent.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = parisNow();
  const weekStart = addDays(now.date, 1 - now.isoWeekday);
  const prevWeekStart = addDays(weekStart, -7);

  const results = { eventReminders: 0, reviewReminders: 0, weeksClosed: 0 };

  // Joueurs actifs + préférence notifications
  const { data: activePlayers } = await admin
    .from("players")
    .select("id, profile:profiles!players_id_fkey(notifications_enabled)")
    .eq("status", "active");

  const players = (activePlayers ?? []).map((p) => {
    const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
    return { id: p.id, notificationsEnabled: profile?.notifications_enabled ?? false };
  });
  const notifiablePlayerIds = new Set(
    players.filter((p) => p.notificationsEnabled).map((p) => p.id)
  );

  // -------------------------------------------------------------------------
  // 1. Rappels 30 min avant les événements du jour
  // -------------------------------------------------------------------------
  if (notifiablePlayerIds.size > 0) {
    const { data: todayEvents } = await admin
      .from("planned_events")
      .select("id, player_id, event_type, event_time")
      .eq("weekday", now.isoWeekday)
      .in("player_id", [...notifiablePlayerIds]);

    for (const event of todayEvents ?? []) {
      const minutesUntil = timeToMinutes(event.event_time) - now.minutesOfDay;
      if (minutesUntil <= 0 || minutesUntil > 30) continue;

      const refKey = `evt:${event.id}:${now.date}`;
      const { data: logged } = await admin
        .from("notification_log")
        .upsert(
          { user_id: event.player_id, kind: "event_reminder", ref_key: refKey },
          { onConflict: "user_id,kind,ref_key", ignoreDuplicates: true }
        )
        .select("id");

      if (logged && logged.length > 0) {
        const label = EVENT_TYPE_LABELS[event.event_type as EventType] ?? "Événement";
        await sendPushToUser(event.player_id, {
          title: `${label} à ${event.event_time.slice(0, 5)}`,
          body: "C'est dans 30 minutes. Tiens ton plan ! 💪",
          url: "/planning",
        });
        results.eventReminders++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Rappel bilan hebdomadaire — dimanche à partir de 18h45
  // -------------------------------------------------------------------------
  if (now.isoWeekday === 7 && now.minutesOfDay >= 18 * 60 + 45 && now.minutesOfDay < 21 * 60) {
    for (const playerId of notifiablePlayerIds) {
      const refKey = `review:${weekStart}`;
      const { data: logged } = await admin
        .from("notification_log")
        .upsert(
          { user_id: playerId, kind: "weekly_review", ref_key: refKey },
          { onConflict: "user_id,kind,ref_key", ignoreDuplicates: true }
        )
        .select("id");

      if (logged && logged.length > 0) {
        await sendPushToUser(playerId, {
          title: "Ton bilan de la semaine 📝",
          body: "Qu'as-tu bien fait ? Que dois-tu améliorer ? 2 minutes suffisent.",
          url: "/planning",
        });
        results.reviewReminders++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Clôture de la semaine précédente (à partir du lundi midi, pour laisser
  //    la matinée du lundi au rattrapage du dimanche). Idempotent : les
  //    résumés sont recalculés tant que la semaine reste modifiable.
  // -------------------------------------------------------------------------
  const closingTime = now.isoWeekday > 1 || (now.isoWeekday === 1 && now.minutesOfDay >= 12 * 60);
  if (closingTime) {
    for (const player of players) {
      const [{ data: events }, { data: completions }] = await Promise.all([
        admin.from("planned_events").select("*").eq("player_id", player.id),
        admin
          .from("event_completions")
          .select("id, planned_event_id, status")
          .eq("player_id", player.id)
          .eq("week_start", prevWeekStart),
      ]);

      const existing = completions ?? [];
      const checkedEventIds = new Set(existing.map((c) => c.planned_event_id).filter(Boolean));

      // matérialise les oublis en "not_done" (une seule fois grâce à la
      // contrainte UNIQUE planned_event_id + week_start)
      const missing = (events ?? []).filter((e) => !checkedEventIds.has(e.id));
      if (missing.length > 0) {
        await admin.from("event_completions").upsert(
          missing.map((e) => ({
            player_id: player.id,
            planned_event_id: e.id,
            week_start: prevWeekStart,
            event_type: e.event_type,
            weekday: e.weekday,
            event_time: e.event_time,
            status: "not_done" as const,
            auto_filled: true,
          })),
          { onConflict: "planned_event_id,week_start", ignoreDuplicates: true }
        );
      }

      // fige / met à jour le résumé de la semaine
      const { data: finalCompletions } = await admin
        .from("event_completions")
        .select("status")
        .eq("player_id", player.id)
        .eq("week_start", prevWeekStart);

      const total = (finalCompletions ?? []).length;
      if (total > 0) {
        const done = (finalCompletions ?? []).filter((c) => c.status === "done").length;
        const { data: upserted } = await admin
          .from("weekly_summaries")
          .upsert(
            {
              player_id: player.id,
              week_start: prevWeekStart,
              planned_count: total,
              done_count: done,
            },
            { onConflict: "player_id,week_start" }
          )
          .select("id");
        if (upserted && upserted.length > 0) results.weeksClosed++;
      }
    }
  }

  return NextResponse.json({ ok: true, parisTime: `${now.date} ${now.time}`, ...results });
}
