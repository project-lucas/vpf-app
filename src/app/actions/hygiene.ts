"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCachedUser } from "@/lib/supabase/server";
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
