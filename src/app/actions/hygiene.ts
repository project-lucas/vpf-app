"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { addDays, parisNow } from "@/lib/dates";
import { HYGIENE_MAX, SLEEP_MAX_HOURS, SLEEP_MIN_HOURS } from "@/lib/hygiene";
import { canUseHygiene, toOffer } from "@/lib/offers";
import type { ActionResult } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface HygieneInput {
  /** heures de sommeil de la nuit précédente, par pas de 30 min */
  sleepHours: number;
  hydration: number;
  carbs: number;
  proteins: number;
  vitamins: number;
}

function isScore(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= HYGIENE_MAX;
}

/**
 * Enregistre (ou corrige) la saisie d'hygiène d'un jour. Une seule ligne par
 * joueur et par jour : re-saisir le même jour écrase la note précédente.
 *
 * L'upsert est sûr ici — `hygiene_logs` (0025) n'a pas de grant colonne
 * restreint, contrairement à event_completions / session_completions.
 */
export async function saveHygieneLog(date: string, input: HygieneInput): Promise<ActionResult> {
  if (!DATE_RE.test(date)) return { ok: false, error: "Date invalide." };

  const today = parisNow().date;
  if (date > today || date < addDays(today, -365)) {
    return { ok: false, error: "Ce jour n'est pas modifiable." };
  }

  // sommeil : bornes du select, arrondi à la demi-heure
  const sleepHours = Math.round(input.sleepHours * 2) / 2;
  if (
    !Number.isFinite(sleepHours) ||
    sleepHours < SLEEP_MIN_HOURS ||
    sleepHours > SLEEP_MAX_HOURS
  ) {
    return { ok: false, error: "Nombre d'heures de sommeil invalide." };
  }

  if (
    !isScore(input.hydration) ||
    !isScore(input.carbs) ||
    !isScore(input.proteins) ||
    !isScore(input.vitamins)
  ) {
    return { ok: false, error: "Chaque critère se note de 1 à 5." };
  }

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // Écran de l'offre formation : la RLS (0026) refuserait de toute façon
  // l'écriture, ce contrôle donne juste un message clair au lieu d'une erreur
  // Postgres si l'offre a changé pendant que la page était ouverte.
  const { data: playerRow } = await supabase
    .from("players")
    .select("offer")
    .eq("id", user.id)
    .maybeSingle();
  if (!canUseHygiene(toOffer(playerRow?.offer))) {
    return { ok: false, error: "Cet écran n'est pas inclus dans ton offre." };
  }

  const { error } = await supabase.from("hygiene_logs").upsert(
    {
      player_id: user.id,
      log_date: date,
      sleep_hours: sleepHours,
      hydration: input.hydration,
      carbs: input.carbs,
      proteins: input.proteins,
      vitamins: input.vitamins,
    },
    { onConflict: "player_id,log_date" }
  );
  if (error) return { ok: false, error: "Enregistrement impossible." };

  revalidatePath("/hygiene");
  // la mission du jour vit aussi dans le planning : sans ça, revenir sur
  // l'onglet afficherait la mission encore « à faire » jusqu'à expiration du
  // cache de route (staleTimes 30 s).
  revalidatePath("/planning");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vidéothèque hygiène de vie (0029) : catalogue admin, activation par joueur
// ---------------------------------------------------------------------------

const HTTP_URL_RE = /^https?:\/\/\S+$/;

export interface HygieneVideoInput {
  title: string;
  url: string;
  category: string;
  description: string;
}

function cleanVideoInput(data: HygieneVideoInput):
  | { ok: true; value: HygieneVideoInput }
  | { ok: false; error: string } {
  const title = data.title.trim().slice(0, 120);
  const url = data.url.trim().slice(0, 500);
  if (!title) return { ok: false, error: "Donne un titre à la vidéo." };
  if (!HTTP_URL_RE.test(url)) {
    return { ok: false, error: "L'URL doit commencer par http(s)://." };
  }
  return {
    ok: true,
    value: {
      title,
      url,
      category: data.category.trim().slice(0, 40),
      description: data.description.trim().slice(0, 500),
    },
  };
}

/** Création d'une vidéo hygiène (admin uniquement — la RLS refuse le reste). */
export async function createHygieneVideo(data: HygieneVideoInput): Promise<ActionResult> {
  const cleaned = cleanVideoInput(data);
  if (!cleaned.ok) return cleaned;

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("hygiene_videos")
    .insert({ ...cleaned.value, created_by: user.id });
  if (error) return { ok: false, error: "Création impossible (réservé aux admins)." };

  revalidatePath("/coach/bibliotheque");
  return { ok: true };
}

/** Retouche d'une vidéo hygiène (admin uniquement). */
export async function updateHygieneVideo(
  videoId: string,
  data: HygieneVideoInput
): Promise<ActionResult> {
  const cleaned = cleanVideoInput(data);
  if (!cleaned.ok) return cleaned;

  const supabase = await createClient();
  const { error } = await supabase
    .from("hygiene_videos")
    .update(cleaned.value)
    .eq("id", videoId);
  if (error) return { ok: false, error: "Modification impossible." };

  revalidatePath("/coach/bibliotheque");
  revalidatePath("/hygiene");
  return { ok: true };
}

/** Suppression d'une vidéo hygiène : elle disparaît aussi chez les joueurs. */
export async function deleteHygieneVideo(videoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("hygiene_videos").delete().eq("id", videoId);
  if (error) return { ok: false, error: "Suppression impossible." };

  revalidatePath("/coach/bibliotheque");
  revalidatePath("/hygiene");
  return { ok: true };
}

/**
 * Synchronise la visibilité d'une vidéo hygiène : les joueurs cochés la voient
 * dans leur onglet Hygiène de vie, les décochés ne la voient plus. Seuls les
 * joueurs de `managedPlayerIds` (ceux du coach connecté) sont touchés.
 * Les joueurs nouvellement activés reçoivent un push.
 */
export async function setHygieneVideoVisibility(
  videoId: string,
  checkedPlayerIds: string[],
  managedPlayerIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: current, error: readError } = await supabase
    .from("hygiene_video_assignments")
    .select("id, player_id")
    .eq("video_id", videoId)
    .in("player_id", managedPlayerIds);
  if (readError) return { ok: false, error: "Lecture impossible." };

  const currentIds = new Set((current ?? []).map((a) => a.player_id));
  const checked = new Set(checkedPlayerIds);

  const toAdd = managedPlayerIds.filter((id) => checked.has(id) && !currentIds.has(id));
  const toRemoveIds = (current ?? []).filter((a) => !checked.has(a.player_id)).map((a) => a.id);

  if (toAdd.length > 0) {
    const { error } = await supabase.from("hygiene_video_assignments").insert(
      toAdd.map((playerId) => ({ video_id: videoId, player_id: playerId, assigned_by: user.id }))
    );
    if (error) {
      // cas le plus probable : joueur repassé en offre perf (verrou RLS 0029)
      return { ok: false, error: "Activation impossible (joueur hors offre formation ?)." };
    }
  }

  if (toRemoveIds.length > 0) {
    const { error } = await supabase
      .from("hygiene_video_assignments")
      .delete()
      .in("id", toRemoveIds);
    if (error) return { ok: false, error: "Désactivation impossible." };
  }

  // push aux joueurs qui découvrent la vidéo (pattern assignSession : envoyé
  // après coup, un push lent ne retarde pas la réponse)
  if (toAdd.length > 0) {
    const { data: video } = await supabase
      .from("hygiene_videos")
      .select("title")
      .eq("id", videoId)
      .maybeSingle();
    const admin = createAdminClient();
    await Promise.all(
      toAdd.map(async (playerId) => {
        const { data: profile } = await admin
          .from("profiles")
          .select("notifications_enabled")
          .eq("id", playerId)
          .maybeSingle();
        if (profile?.notifications_enabled) {
          await sendPushToUser(playerId, {
            title: "Nouvelle vidéo Hygiène de vie 🎥",
            body: video?.title
              ? `${video.title} t'attend dans ton onglet Hygiène.`
              : "Une nouvelle vidéo t'attend dans ton onglet Hygiène.",
            url: "/hygiene",
          });
        }
      })
    );
  }

  revalidatePath("/coach/bibliotheque");
  revalidatePath("/hygiene");
  for (const playerId of [...toAdd]) revalidatePath(`/coach/joueurs/${playerId}`);
  return { ok: true };
}
