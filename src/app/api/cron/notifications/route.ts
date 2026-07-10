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
 * 3. Clôture quotidienne : dès la première exécution après minuit, les
 *    événements de la veille (et de tout jour passé) non pointés sont
 *    matérialisés en "not_done" — un jour entièrement ignoré casse la série
 *    au réveil, un jour partiellement fait reste "partiel" dans l'historique
 *    sans casser la série.
 * 4. Dès le lundi midi : clôture de la semaine précédente — fige le résumé
 *    hebdomadaire (weekly_summaries). C'est la "nouvelle semaine de suivi"
 *    automatique.
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

  const results = { eventReminders: 0, reviewReminders: 0, missedFilled: 0, weeksClosed: 0, recaps: 0 };

  // Joueurs actifs + préférence notifications. Les joueurs blessés / en
  // vacances sont entièrement gelés : pas de rappels, pas de matérialisation
  // des oublis, pas de résumé hebdo — leur série et leur discipline survivent
  // à l'absence (un jour sans pointage est neutre pour la série). Au retour,
  // availability_since porte la date de retour : la clôture quotidienne ne
  // matérialise jamais les jours d'absence.
  const { data: activePlayers } = await admin
    .from("players")
    .select("id, availability, availability_since, profile:profiles!players_id_fkey(notifications_enabled)")
    .eq("status", "active");

  const players = (activePlayers ?? [])
    .filter((p) => (p.availability ?? "available") === "available")
    .map((p) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      return {
        id: p.id,
        availabilitySince: p.availability_since as string | null,
        notificationsEnabled: profile?.notifications_enabled ?? false,
      };
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
      .select("id, player_id, event_type, event_time, custom_name")
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
        const label =
          (event.event_type === "autre" && event.custom_name) ||
          EVENT_TYPE_LABELS[event.event_type as EventType] ||
          "Événement";
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
  // 3. Clôture quotidienne : tout événement d'un jour PASSÉ encore non pointé
  //    devient "not_done" (idempotent grâce à la contrainte UNIQUE
  //    planned_event_id + week_start). C'est ce qui arrête la série dès le
  //    lendemain d'un jour entièrement ignoré — un jour partiellement fait
  //    garde ses "done" et reste "partiel" dans l'historique. Les jours
  //    antérieurs à availability_since (retour de blessure / vacances)
  //    restent neutres : l'absence ne casse pas la série.
  // -------------------------------------------------------------------------
  for (const player of players) {
    const weekStarts = [prevWeekStart, weekStart];
    const [{ data: events }, { data: completions }] = await Promise.all([
      admin.from("planned_events").select("*").eq("player_id", player.id),
      admin
        .from("event_completions")
        .select("planned_event_id, week_start")
        .eq("player_id", player.id)
        .in("week_start", weekStarts),
    ]);

    const checked = new Set(
      (completions ?? [])
        .filter((c) => c.planned_event_id)
        .map((c) => `${c.week_start}|${c.planned_event_id}`)
    );

    const rows = [];
    for (const ws of weekStarts) {
      for (const e of events ?? []) {
        const date = addDays(ws, e.weekday - 1);
        if (date >= now.date) continue; // la journée en cours reste ouverte
        if (player.availabilitySince && date < player.availabilitySince) continue;
        // un événement ajouté en cours de semaine ne crée pas de « non fait »
        // rétroactif sur les jours où il n'existait pas encore
        if (e.created_at && date < parisNow(new Date(e.created_at)).date) continue;
        if (checked.has(`${ws}|${e.id}`)) continue;
        rows.push({
          player_id: player.id,
          planned_event_id: e.id,
          week_start: ws,
          event_type: e.event_type,
          weekday: e.weekday,
          event_time: e.event_time,
          custom_name: e.custom_name ?? "",
          custom_icon: e.custom_icon ?? "",
          custom_color: e.custom_color ?? "",
          status: "not_done" as const,
          auto_filled: true,
        });
      }
    }
    if (rows.length > 0) {
      await admin
        .from("event_completions")
        .upsert(rows, { onConflict: "planned_event_id,week_start", ignoreDuplicates: true });
      results.missedFilled += rows.length;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Clôture de la semaine précédente (à partir du lundi midi) : fige le
  //    résumé hebdomadaire. Les oublis sont déjà matérialisés par la clôture
  //    quotidienne (bloc 3, même exécution). Idempotent : les résumés sont
  //    recalculés tant que la semaine reste modifiable.
  // -------------------------------------------------------------------------
  const closingTime = now.isoWeekday > 1 || (now.isoWeekday === 1 && now.minutesOfDay >= 12 * 60);
  if (closingTime) {
    for (const player of players) {
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

  // -------------------------------------------------------------------------
  // 5. Récap de la semaine écoulée — lundi 12h-20h, APRÈS la clôture (bloc 4,
  //    même exécution) pour lire des résumés à jour. Un push par joueur qui
  //    célèbre ou relance : c'est le rituel qui fait revenir.
  // -------------------------------------------------------------------------
  if (now.isoWeekday === 1 && now.minutesOfDay >= 12 * 60 && now.minutesOfDay < 20 * 60) {
    for (const playerId of notifiablePlayerIds) {
      const { data: summary } = await admin
        .from("weekly_summaries")
        .select("planned_count, done_count")
        .eq("player_id", playerId)
        .eq("week_start", prevWeekStart)
        .maybeSingle();
      if (!summary || summary.planned_count === 0) continue;

      const refKey = `recap:${prevWeekStart}`;
      const { data: logged } = await admin
        .from("notification_log")
        .upsert(
          { user_id: playerId, kind: "weekly_recap", ref_key: refKey },
          { onConflict: "user_id,kind,ref_key", ignoreDuplicates: true }
        )
        .select("id");

      if (logged && logged.length > 0) {
        const pct = Math.round((summary.done_count / summary.planned_count) * 100);
        const body =
          pct >= 100
            ? `${summary.done_count}/${summary.planned_count} — semaine parfaite. Chapeau. 🏆`
            : pct >= 60
              ? `${summary.done_count}/${summary.planned_count} bouclés (${pct} %). Solide — on vise la semaine parfaite ?`
              : `${summary.done_count}/${summary.planned_count} bouclés (${pct} %). Nouvelle semaine, nouveau départ. 🔥`;
        await sendPushToUser(playerId, {
          title: "Ta semaine en un coup d'œil 🏀",
          body,
          url: "/dashboard",
        });
        results.recaps++;
      }
    }
  }

  return NextResponse.json({ ok: true, parisTime: `${now.date} ${now.time}`, ...results });
}
