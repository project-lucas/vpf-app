import webpush from "web-push";
import { createAdminClient } from "./supabase/admin";
import type { PushSubscriptionRow } from "./types";

let configured = false;

function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:contact@vpf.fr",
      publicKey,
      privateKey
    );
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Nombre d'appareils réellement abonnés au push pour un utilisateur.
 *
 * Passe par le service_role : la policy de push_subscriptions est volontairement
 * limitée au propriétaire (chaque ligne porte les clés de chiffrement du
 * navigateur), un coach ne peut donc pas les lire — et n'a pas à les lire, seul
 * le compte l'intéresse. L'appelant DOIT avoir vérifié sous RLS qu'il a le droit
 * de consulter ce joueur avant d'appeler cette fonction.
 */
export async function countPushDevices(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

/**
 * Envoie une notification push à toutes les subscriptions d'un utilisateur.
 * Les subscriptions expirées (404/410) sont supprimées au passage.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const admin = createAdminClient();
  const { data } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  const subs = (data ?? []) as PushSubscriptionRow[];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );
}
