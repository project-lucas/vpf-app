"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, parisNow } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// createHabit / updateHabit supprimées avec HabitsManager : la création
// d'habitudes passe désormais par les activités perso du planning (0016).

export async function deleteHabit(habitId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("habits").delete().eq("id", habitId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * Coche / décoche un jour pour une habitude. Uniquement aujourd'hui ou un jour
 * passé (≤ 1 an) — la RLS applique les mêmes bornes côté base.
 */
export async function toggleHabitCheck(habitId: string, date: string): Promise<ActionResult> {
  if (!DATE_RE.test(date)) return { ok: false, error: "Date invalide." };
  const today = parisNow().date;
  if (date > today || date < addDays(today, -365)) {
    return { ok: false, error: "Ce jour n'est pas modifiable." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: existing } = await supabase
    .from("habit_checks")
    .select("id")
    .eq("habit_id", habitId)
    .eq("check_date", date)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("habit_checks").delete().eq("id", existing.id);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const { error } = await supabase
      .from("habit_checks")
      .insert({ habit_id: habitId, player_id: user.id, check_date: date });
    // course possible (double tap) : le doublon est bloqué par la contrainte unique
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: "Enregistrement impossible." };
    }
  }
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  return { ok: true };
}
