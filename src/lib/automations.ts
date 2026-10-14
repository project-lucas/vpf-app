import { createAdminClient } from "./supabase/admin";
import { sendPushToUser, type PushPayload } from "./push";

/**
 * Les messages automatiques « VPF » (0043) : un message sans auteur dans le
 * fil Global du joueur, doublé d'un push s'il a activé les notifications. Le
 * message dans le fil est ce qui garantit que le rappel existe même sans
 * push — un push n'arrive qu'à ceux qui ont installé l'app et dit oui.
 *
 * Idempotent par (joueur, nature, référence) grâce à `notification_log` : le
 * cron tourne toutes les 10 minutes, un rappel ne doit partir qu'une fois.
 * Réservé au serveur (service_role) : un client ne peut pas écrire `is_system`.
 */
export async function postSystemMessage(input: {
  playerId: string;
  /** nature du rappel (clé du journal des envois) */
  kind: string;
  /** référence de l'occurrence : la semaine, le match… */
  refKey: string;
  /** le texte, tel que le joueur le lira dans son fil */
  body: string;
  /** push à envoyer en plus, si le joueur a activé les notifications */
  push: PushPayload | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data: logged } = await admin
    .from("notification_log")
    .upsert(
      { user_id: input.playerId, kind: input.kind, ref_key: input.refKey },
      { onConflict: "user_id,kind,ref_key", ignoreDuplicates: true }
    )
    .select("id");
  if (!logged || logged.length === 0) return false;

  const { error } = await admin.from("conversation_messages").insert({
    player_id: input.playerId,
    channel_admin_id: null,
    sender_id: null,
    is_system: true,
    body: input.body.slice(0, 2000),
  });
  if (error) {
    // on rend la clé : le prochain passage du cron réessaiera, rien ne part
    console.error("[automations] message système refusé", {
      playerId: input.playerId,
      kind: input.kind,
      message: error.message,
    });
    await admin
      .from("notification_log")
      .delete()
      .match({ user_id: input.playerId, kind: input.kind, ref_key: input.refKey });
    return false;
  }
  if (input.push) await sendPushToUser(input.playerId, input.push);
  return true;
}

/**
 * Les références déjà envoyées pour ces joueurs : à lire en une requête avant
 * une boucle, pour n'appeler `postSystemMessage` que pour les absents (le
 * cron passe toutes les 10 minutes).
 */
export async function alreadySent(
  kind: string,
  pairs: { playerId: string; refKey: string }[]
): Promise<Set<string>> {
  if (pairs.length === 0) return new Set();
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_log")
    .select("user_id, ref_key")
    .eq("kind", kind)
    .in("user_id", [...new Set(pairs.map((p) => p.playerId))])
    .in("ref_key", [...new Set(pairs.map((p) => p.refKey))]);
  return new Set((data ?? []).map((r) => `${r.user_id}|${r.ref_key}`));
}

/** « samedi 18 octobre » — le jour d'un match, pour un message au joueur. */
export function matchDayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
}

export function reviewReminderBody(firstName: string): string {
  const prenom = firstName.trim() || "toi";
  return `Salut ${prenom} ! C'est l'heure du bilan de la semaine 📝 Ouvre l'app : ce que tu as bien fait, ce que tu veux améliorer, et comment va ton corps. Deux minutes, et ton coach te répond.`;
}

export function matchSheetBody(firstName: string, date: string): string {
  const prenom = firstName.trim() || "toi";
  return `Salut ${prenom} ! Ton match de ${matchDayLabel(date)} est passé : remplis ta feuille de match dans l'app (minutes, tirs, lancers francs). Ça nourrit tes records et ton suivi 🏀`;
}
