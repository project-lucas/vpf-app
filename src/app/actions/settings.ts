"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

/**
 * Active/désactive les notifications push. Passe par le service_role car la
 * colonne notifications_enabled n'est pas modifiable par les clients (grants).
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ notifications_enabled: enabled })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/parametres");
  return { ok: true };
}

/** Enregistre la subscription push du navigateur courant. */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  if (!sub.endpoint.startsWith("https://")) return { ok: false, error: "Subscription invalide." };

  // service_role : si l'endpoint existait pour un autre compte (téléphone
  // partagé), il est réassigné à l'utilisateur courant
  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: "endpoint" }
    );
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}
