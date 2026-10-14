"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchNavUnread,
  getStaffUnreadPlayerIds,
  getUnreadChannelKeys,
  hasNavUnread,
  hasStaffUnread,
} from "@/lib/conversations";
import { getParentChild } from "@/lib/parent-data";
import { getNavRole } from "@/lib/auth";
import { toOffer } from "@/lib/offers";
import { sendPushToUser, type PushPayload } from "@/lib/push";
import { messagePreview } from "@/lib/attachments";
import { logStaffMessage } from "@/lib/journal";
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  CONVERSATION_HISTORY_LIMIT,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_BUCKET,
  MESSAGE_MAX_LENGTH,
  MESSAGE_SIGNED_URL_TTL_SECONDS,
} from "@/lib/constants";
import type {
  ActionResult,
  Announcement,
  AnnouncementAudience,
  ConversationMessage,
  ConversationMessageWithSender,
  MessageAttachmentInput,
  UserRole,
} from "@/lib/types";

/** Push à un utilisateur s'il n'a pas coupé ses notifications. */
async function pushToUserIfEnabled(userId: string, payload: PushPayload): Promise<void> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("notifications_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.notifications_enabled) await sendPushToUser(userId, payload);
}

function excerpt(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 3)}…` : text;
}

/**
 * URL signées des pièces jointes, par chemin. Le bucket `messages` est privé
 * (0036) : la seule façon d'afficher une image ou de lire un vocal est une URL
 * temporaire, refabriquée à chaque lecture du fil.
 *
 * Signature par le service_role, ce qui est sûr ici et seulement ici : les
 * chemins viennent de messages déjà lus sous RLS — c'est cette lecture qui
 * prouve l'accès au canal.
 */
async function signAttachments(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(MESSAGE_BUCKET)
    .createSignedUrls(paths, MESSAGE_SIGNED_URL_TTL_SECONDS);

  const signed = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/**
 * Enrichit des messages avec le nom et le rôle de leur auteur, et l'URL signée
 * de leur pièce jointe.
 *
 * Passe par le service_role : la RLS de profiles ne laisse pas un joueur lire
 * le profil d'un admin qui n'est pas son coach — or un admin peut écrire dans
 * n'importe quel fil. L'appelant DOIT avoir lu les messages sous RLS avant :
 * c'est cette lecture qui prouve l'accès au fil. On n'expose que nom + rôle.
 */
async function withSenders(
  messages: ConversationMessage[]
): Promise<ConversationMessageWithSender[]> {
  const senderIds = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))] as string[];
  const paths = [...new Set(messages.map((m) => m.attachment_path).filter(Boolean))] as string[];

  const admin = createAdminClient();
  const [{ data: profiles }, signed] = await Promise.all([
    senderIds.length > 0
      ? admin.from("profiles").select("id, first_name, last_name, role").in("id", senderIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; role: string }[] }),
    signAttachments(paths),
  ]);

  const byId = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      { name: `${p.first_name} ${p.last_name}`.trim(), role: p.role as UserRole },
    ])
  );
  return messages.map((m) => ({
    ...m,
    sender_name: (m.sender_id && byId.get(m.sender_id)?.name) || "Compte supprimé",
    sender_role: (m.sender_id && byId.get(m.sender_id)?.role) || null,
    attachment_url: (m.attachment_path && signed.get(m.attachment_path)) || null,
  }));
}

/**
 * Pièce jointe recevable : le chemin doit appartenir au dossier du joueur
 * (c'est le dossier qui porte l'accès, cf. can_access_message_file) et la
 * nature du fichier doit être l'une des quatre connues. Ce qui est refusé ici
 * l'aurait été par la contrainte de la base — avec une erreur illisible.
 */
function cleanAttachment(
  playerId: string,
  attachment: MessageAttachmentInput | null
): MessageAttachmentInput | null | "invalid" {
  if (!attachment) return null;
  const { path, kind, name, size, duration } = attachment;
  if (!path.startsWith(`${playerId}/`) || path.includes("..")) return "invalid";
  if (!["image", "video", "audio", "file"].includes(kind)) return "invalid";
  if (!Number.isFinite(size) || size <= 0 || size > MESSAGE_ATTACHMENT_MAX_BYTES) return "invalid";

  return {
    path,
    kind,
    name: name.trim().slice(0, 200) || "fichier",
    size: Math.round(size),
    duration: duration && Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : null,
  };
}

/**
 * Un canal du fil d'un joueur, du plus ancien au plus récent. La lecture se
 * fait sous RLS : un appelant sans accès au canal récupère une liste vide.
 * Sert au chargement initial (pages serveur) et au rafraîchissement périodique
 * du composant client.
 *
 * `channelAdminId` : null = fil coach & parents, sinon fil privé de cet admin
 * (offre formation, migration 0034).
 *
 * Borné aux CONVERSATION_HISTORY_LIMIT derniers messages : sur une saison le fil
 * atteindrait plusieurs centaines de lignes rechargées toutes les 30 s, pour un
 * historique que personne ne remonte. Le composant n'en affiche qu'une tranche
 * et déplie le reste à la demande.
 */
export async function getConversationMessages(
  playerId: string,
  channelAdminId: string | null = null
): Promise<ConversationMessageWithSender[]> {
  const supabase = await createClient();
  // les N plus récents = tri décroissant + limite, puis on remet dans l'ordre
  let query = supabase
    .from("conversation_messages")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(CONVERSATION_HISTORY_LIMIT);
  query = channelAdminId
    ? query.eq("channel_admin_id", channelAdminId)
    : query.is("channel_admin_id", null);

  const { data } = await query;
  const chronological = [...((data ?? []) as ConversationMessage[])].reverse();
  return withSenders(chronological);
}

/**
 * Avance le marqueur de lecture d'un canal pour l'utilisateur courant.
 *
 * Pas d'upsert PostgREST : la table n'a plus de clé primaire depuis 0034 (le
 * canal « coach » est identifié par un NULL, donc par des index uniques
 * partiels). On met à jour, et on n'insère que si la ligne n'existait pas —
 * un doublon inséré en parallèle (23505) veut dire que c'est déjà fait.
 */
async function touchRead(
  supabase: SupabaseClient,
  playerId: string,
  userId: string,
  channelAdminId: string | null
): Promise<boolean> {
  const filter = supabase
    .from("conversation_reads")
    .update({ last_read_at: new Date().toISOString() })
    .eq("player_id", playerId)
    .eq("user_id", userId);

  const { data: updated, error: updateError } = await (channelAdminId
    ? filter.eq("channel_admin_id", channelAdminId)
    : filter.is("channel_admin_id", null)
  ).select("user_id");
  if (updateError) return false;
  if (updated && updated.length > 0) return true;

  const { error } = await supabase
    .from("conversation_reads")
    .insert({ player_id: playerId, user_id: userId, channel_admin_id: channelAdminId });
  return !error || error.code === "23505";
}

/**
 * Envoi d'un message dans un canal du fil d'un joueur. L'insert passe sous RLS
 * (la policy vérifie que l'expéditeur participe à CE canal, et qu'un fil privé
 * n'est ouvert que sur une fiche formation), puis les destinataires du canal
 * — et eux seuls — reçoivent un push.
 *
 *  * Fil coach & parents : joueur, coach référent, parents. Un message venu de
 *    la famille remonte en plus aux admins.
 *  * Fil privé : le joueur et l'admin porteur du fil, personne d'autre — ni le
 *    coach référent, ni les parents, ni l'autre admin.
 */
export async function sendConversationMessage(
  playerId: string,
  body: string,
  channelAdminId: string | null = null,
  attachment: MessageAttachmentInput | null = null
): Promise<ActionResult> {
  const clean = body.trim().slice(0, MESSAGE_MAX_LENGTH);
  const file = cleanAttachment(playerId, attachment);
  if (file === "invalid") return { ok: false, error: "Pièce jointe invalide." };
  // une pièce jointe se suffit à elle-même ; du vide, non
  if (!clean && !file) return { ok: false, error: "Le message est vide." };

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase.from("conversation_messages").insert({
    player_id: playerId,
    channel_admin_id: channelAdminId,
    sender_id: user.id,
    body: clean,
    attachment_path: file?.path ?? null,
    attachment_kind: file?.kind ?? null,
    attachment_name: file?.name ?? null,
    attachment_size: file?.size ?? null,
    attachment_duration: file?.duration ?? null,
  });
  if (error) return { ok: false, error: "Envoi impossible." };

  // écrire dans un canal vaut lecture de tout ce qui précède
  await touchRead(supabase, playerId, user.id, channelAdminId);

  // Destinataires du push : les participants du canal moins l'expéditeur.
  // L'insert RLS a déjà prouvé l'accès ; le service_role ne sert qu'à composer
  // la notification.
  const admin = createAdminClient();
  const [{ data: player }, { data: senderProfile }, { data: playerProfile }, { data: parentLinks }] =
    await Promise.all([
      admin.from("players").select("coach_id").eq("id", playerId).maybeSingle(),
      admin.from("profiles").select("first_name, last_name, role").eq("id", user.id).maybeSingle(),
      admin.from("profiles").select("first_name").eq("id", playerId).maybeSingle(),
      channelAdminId
        ? Promise.resolve({ data: [] })
        : admin.from("parent_links").select("parent_id").eq("player_id", playerId),
    ]);
  const senderName =
    `${senderProfile?.first_name ?? ""} ${senderProfile?.last_name ?? ""}`.trim() || "Un membre du staff";
  const playerName = playerProfile?.first_name ?? "un joueur";

  // chaque destinataire ouvre le canal dans SA propre interface
  const recipients = new Map<string, string>([[playerId, "/parametres"]]);
  const staffIds = new Set<string>();

  if (channelAdminId) {
    // fil privé : le porteur du fil (admin ou coach référent, 0037), lui seul
    recipients.set(channelAdminId, `/coach/joueurs/${playerId}?onglet=messages`);
    staffIds.add(channelAdminId);
  } else {
    if (player?.coach_id) {
      recipients.set(player.coach_id, `/coach/joueurs/${playerId}?onglet=messages`);
      staffIds.add(player.coach_id);
    }
    for (const link of parentLinks ?? []) recipients.set(link.parent_id, "/parent/messages");

    // Un message venu de la famille (joueur ou parent) remonte AUSSI aux admins,
    // même s'ils n'encadrent pas ce joueur : c'est le staff qui doit répondre
    // quand le coach référent est indisponible. Les messages du staff, eux, ne
    // se re-notifient pas entre eux.
    const fromFamily = senderProfile?.role === "player" || senderProfile?.role === "parent";
    if (fromFamily) {
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
      for (const a of admins ?? []) {
        recipients.set(a.id, `/coach/joueurs/${playerId}?onglet=messages`);
        staffIds.add(a.id);
      }
    }
  }
  recipients.delete(user.id);

  // le journal du staff : un message au joueur est un geste qui compte
  if (senderProfile?.role === "coach" || senderProfile?.role === "admin") {
    await logStaffMessage({
      actorId: user.id,
      playerId,
      playerFirstName: playerName,
      isPrivate: channelAdminId !== null,
    });
  }

  await Promise.all(
    [...recipients].map(([recipientId, url]) =>
      pushToUserIfEnabled(recipientId, {
        // le staff suit plusieurs fils : le prénom du joueur situe la conversation
        title: staffIds.has(recipientId)
          ? `${senderName} · ${channelAdminId ? "fil privé de" : "fil de"} ${playerName}`
          : recipientId === playerId
            ? `Message de ${senderName} 💬`
            : `Message de ${senderName}`,
        // un vocal ou une photo n'a pas de texte : on annonce sa nature
        body: messagePreview({ body: clean, attachment_kind: file?.kind ?? null }),
        url,
        kind: "message",
      })
    )
  );

  revalidatePath("/parametres");
  revalidatePath(`/coach/joueurs/${playerId}`);
  revalidatePath("/coach/messages");
  // l'accueil : l'alerte « silence » tombe, le journal gagne une ligne
  revalidatePath("/coach");
  if (!channelAdminId) revalidatePath("/parent/messages");
  return { ok: true };
}

/**
 * Modification d'un message déjà envoyé. La RLS (0036) tranche : seul l'auteur
 * réécrit, et seulement le texte — la pièce jointe, elle, ne se remplace pas
 * (échanger une photo sous un message déjà lu rendrait le fil intraçable). Un
 * trigger pose `edited_at`, le fil affiche donc toujours « modifié ».
 *
 * Un message qui n'a que sa pièce jointe peut recevoir une légende ; on ne peut
 * pas, en revanche, vider le texte d'un message qui n'a que ça — ce serait une
 * suppression déguisée, qui a déjà son bouton.
 */
export async function editConversationMessage(
  messageId: string,
  body: string
): Promise<ActionResult> {
  const clean = body.trim().slice(0, MESSAGE_MAX_LENGTH);

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { data: current } = await supabase
    .from("conversation_messages")
    .select("attachment_path")
    .eq("id", messageId)
    .maybeSingle();
  if (!clean && !current?.attachment_path) {
    return { ok: false, error: "Le message est vide — supprime-le plutôt." };
  }

  // select() pour distinguer « modifié » de « refusé par la RLS » : un update
  // qui ne touche aucune ligne ne remonte pas d'erreur Postgres.
  const { data, error } = await supabase
    .from("conversation_messages")
    .update({ body: clean })
    .eq("id", messageId)
    .select("player_id");
  if (error) return { ok: false, error: "Modification impossible." };
  if (!data || data.length === 0) {
    return { ok: false, error: "Ce message ne peut plus être modifié." };
  }

  revalidatePath("/parametres");
  revalidatePath(`/coach/joueurs/${data[0].player_id}`);
  revalidatePath("/coach/messages");
  revalidatePath("/parent/messages");
  return { ok: true };
}

/**
 * Suppression d'un message du fil. La RLS (0033) tranche : on ne supprime que
 * ses propres messages — un admin peut en plus modérer ceux des autres.
 *
 * La pièce jointe part avec le message : un fichier orphelin dans le bucket ne
 * serait plus atteignable par l'interface, mais resterait facturé et lisible
 * par qui aurait gardé une URL signée.
 */
export async function deleteConversationMessage(messageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // select() pour distinguer « supprimé » de « refusé par la RLS » : un delete
  // qui ne touche aucune ligne ne remonte pas d'erreur Postgres.
  const { data, error } = await supabase
    .from("conversation_messages")
    .delete()
    .eq("id", messageId)
    .select("player_id, attachment_path");
  if (error) return { ok: false, error: "Suppression impossible." };
  if (!data || data.length === 0) {
    return { ok: false, error: "Ce message ne peut plus être supprimé." };
  }

  // le delete RLS a prouvé le droit sur le message : le fichier suit
  const path = data[0].attachment_path;
  if (path) await createAdminClient().storage.from(MESSAGE_BUCKET).remove([path]);

  revalidatePath("/parametres");
  revalidatePath(`/coach/joueurs/${data[0].player_id}`);
  revalidatePath("/coach/messages");
  revalidatePath("/parent/messages");
  return { ok: true };
}

/**
 * Abandon d'une pièce jointe déposée mais jamais envoyée (le rédacteur retire
 * le fichier, ou ferme le fil). Sans ça, chaque hésitation laisserait un
 * fichier définitif dans le bucket.
 *
 * La suppression passe sous RLS : la policy `messages_files_delete` n'accepte
 * que le propriétaire du dépôt (ou un admin), donc jamais le fichier d'autrui.
 */
export async function discardMessageAttachment(path: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase.storage.from(MESSAGE_BUCKET).remove([path]);
  if (error) return { ok: false, error: "Suppression impossible." };
  return { ok: true };
}

/** Marque un canal comme lu pour l'utilisateur courant (pastille non-lu). */
export async function markConversationRead(
  playerId: string,
  channelAdminId: string | null = null
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const ok = await touchRead(supabase, playerId, user.id, channelAdminId);
  if (!ok) return { ok: false, error: "Enregistrement impossible." };

  // sans ça, revenir sur la boîte de réception dans les 30 s (staleTimes)
  // réafficherait le fil en rouge alors qu'on vient de le lire
  revalidatePath("/coach/messages");
  revalidatePath("/coach");
  return { ok: true };
}

/**
 * Canaux qui portent du nouveau pour l'utilisateur courant, parmi ceux qu'on
 * lui affiche. Rafraîchit les pastilles pendant qu'un fil est ouvert — la RLS
 * fait foi, un canal hors de portée ne renvoie jamais de pastille.
 */
export async function getUnreadChannels(
  playerId: string,
  adminIds: (string | null)[]
): Promise<string[]> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return [];
  return getUnreadChannelKeys(supabase, playerId, user.id, adminIds);
}

/**
 * Y a-t-il un message non lu quelque part, pour l'utilisateur courant ?
 *
 * Alimente la pastille de la barre de navigation, des deux côtés : l'onglet
 * Profil du joueur et l'onglet Joueurs du staff. Les layouts posent la valeur
 * initiale au rendu serveur ; cette action la rafraîchit sans navigation —
 * sinon un joueur planté sur son planning ne verrait jamais rien arriver.
 *
 * Le rôle vient du cookie `vpf-nav` : la RLS reste seule juge de ce qui est
 * lisible, ce rôle ne sert qu'à choisir le bon calcul.
 */
export async function getNavUnreadFlag(): Promise<boolean> {
  const user = await getCachedUser();
  if (!user) return false;

  const supabase = await createClient();
  const role = await getNavRole();

  if (role === "coach" || role === "admin") return hasStaffUnread(supabase, user.id);
  if (role === "player") {
    const [{ data: playerRow }, navUnread] = await Promise.all([
      supabase.from("players").select("offer").eq("id", user.id).maybeSingle(),
      fetchNavUnread(supabase, user.id),
    ]);
    return hasNavUnread(navUnread, toOffer(playerRow?.offer));
  }
  if (role === "parent") {
    // un parent n'a que le fil coach & parents de son enfant — la RLS ne lui
    // rendra jamais un fil privé, même en le demandant
    const child = await getParentChild();
    if (!child) return false;
    const unread = await getStaffUnreadPlayerIds(supabase, user.id, [child.playerId]);
    return unread.size > 0;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Annonces du club (admins → joueurs, ciblage par offre)
// ---------------------------------------------------------------------------

function toAudience(value: unknown): AnnouncementAudience {
  return value === "perf" || value === "formation" ? value : "all";
}

const AUDIENCE_PUSH_LABEL: Record<AnnouncementAudience, string> = {
  all: "Annonce du club 📣",
  perf: "Annonce — offre Perf 📣",
  formation: "Annonce — offre Formation 📣",
};

/**
 * Publication d'une annonce (admin uniquement — la policy RLS refuse le reste).
 * Tous les joueurs actifs ciblés reçoivent un push.
 */
export async function publishAnnouncement(data: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
}): Promise<ActionResult> {
  const title = data.title.trim().slice(0, ANNOUNCEMENT_TITLE_MAX_LENGTH);
  const body = data.body.trim().slice(0, ANNOUNCEMENT_BODY_MAX_LENGTH);
  const audience = toAudience(data.audience);
  if (!title) return { ok: false, error: "Donne un titre à l'annonce." };
  if (!body) return { ok: false, error: "L'annonce est vide." };

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("announcements")
    .insert({ author_id: user.id, audience, title, body });
  if (error) return { ok: false, error: "Publication impossible (réservé aux admins)." };

  // push à tous les joueurs actifs ciblés (hors notifications coupées)
  const admin = createAdminClient();
  let query = admin.from("players").select("id").eq("status", "active");
  if (audience !== "all") query = query.eq("offer", audience);
  const { data: players } = await query;

  await Promise.all(
    (players ?? []).map((p) =>
      pushToUserIfEnabled(p.id, {
        title: AUDIENCE_PUSH_LABEL[audience],
        body: `${title} — ${excerpt(body, 100)}`,
        url: "/planning",
        kind: "announcement",
      })
    )
  );

  revalidatePath("/coach/admin");
  return { ok: true };
}

/** Suppression d'une annonce (admin uniquement via RLS). */
export async function deleteAnnouncement(announcementId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/coach/admin");
  return { ok: true };
}

/**
 * Marque des annonces comme lues pour l'utilisateur courant. Insert simple avec
 * doublons ignorés (pattern du projet : jamais d'upsert écrasant sur les tables
 * de pointage).
 */
export async function markAnnouncementsRead(announcementIds: string[]): Promise<ActionResult> {
  if (announcementIds.length === 0) return { ok: true };
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase.from("announcement_reads").upsert(
    announcementIds.map((id) => ({ announcement_id: id, user_id: user.id })),
    { onConflict: "announcement_id,user_id", ignoreDuplicates: true }
  );
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

/** Annonces visibles par l'utilisateur courant (RLS), plus récentes d'abord. */
export async function getMyAnnouncements(): Promise<{
  announcements: Announcement[];
  unreadIds: string[];
}> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { announcements: [], unreadIds: [] };

  const [{ data: announcements }, { data: reads }] = await Promise.all([
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("announcement_reads").select("announcement_id").eq("user_id", user.id),
  ]);

  const readIds = new Set((reads ?? []).map((r) => r.announcement_id));
  const list = (announcements ?? []) as Announcement[];
  return {
    announcements: list,
    unreadIds: list.filter((a) => !readIds.has(a.id)).map((a) => a.id),
  };
}
