"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { HABIT_COLORS, HABIT_ICON_NAMES } from "@/lib/constants";
import { addDays, parisNow } from "@/lib/dates";
import type { ActionResult, HabitColor } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface HabitInput {
  name: string;
  description: string;
  goal: string;
  icon: string;
  color: HabitColor;
}

function validate(input: HabitInput): string | null {
  if (!input.name.trim() || input.name.trim().length > 60) {
    return "Nom d'habitude invalide (60 caractères max).";
  }
  if (input.description.length > 200) return "Description trop longue (200 caractères max).";
  if (input.goal.length > 80) return "Objectif trop long (80 caractères max).";
  if (!(HABIT_ICON_NAMES as readonly string[]).includes(input.icon)) return "Icône invalide.";
  if (!(input.color in HABIT_COLORS)) return "Couleur invalide.";
  return null;
}

export async function createHabit(input: HabitInput): Promise<ActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { count } = await supabase
    .from("habits")
    .select("id", { count: "exact", head: true })
    .eq("player_id", user.id);
  if ((count ?? 0) >= 10) return { ok: false, error: "10 habitudes maximum — supprime-en une d'abord." };

  const { error } = await supabase.from("habits").insert({
    player_id: user.id,
    name: input.name.trim(),
    description: input.description.trim(),
    goal: input.goal.trim(),
    icon: input.icon,
    color: input.color,
    position: (count ?? 0) + 1,
  });
  if (error) return { ok: false, error: "Création impossible." };
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  return { ok: true };
}

export async function updateHabit(habitId: string, input: HabitInput): Promise<ActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from("habits")
    .update({
      name: input.name.trim(),
      description: input.description.trim(),
      goal: input.goal.trim(),
      icon: input.icon,
      color: input.color,
    })
    .eq("id", habitId);
  if (error) return { ok: false, error: "Modification impossible." };
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  return { ok: true };
}

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
