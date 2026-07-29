"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
} from "@/lib/constants";
import type {
  ActionResult,
  Announcement,
  AnnouncementAudience,
  ConversationMessage,
  ConversationMessageWithSender,
  UserRole,
} from "@/lib/types";

/** Push à un utilisateur s'il n'a pas coupé ses notifications. */
async function pushToUserIfEnabled(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
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
 * Enrichit des messages avec le nom et le rôle de leur auteur.
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
  if (senderIds.length === 0) {
    return messages.map((m) => ({ ...m, sender_name: "", sender_role: null }));
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, role")
    .in("id", senderIds);

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
  }));
}

/**
 * Fil de discussion d'un joueur, du plus ancien au plus récent. La lecture se
 * fait sous RLS : un appelant sans accès au fil récupère une liste vide.
 * Sert au chargement initial (pages serveur) et au rafraîchissement périodique
 * du composant client.
 */
export async function getConversationMessages(
  playerId: string
): Promise<ConversationMessageWithSender[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });
  return withSenders((data ?? []) as ConversationMessage[]);
}

/**
 * Envoi d'un message dans le fil d'un joueur. L'insert passe sous RLS (la
 * policy vérifie que l'expéditeur participe au fil), puis les autres
 * participants — joueur et coach référent — reçoivent un push.
 */
export async function sendConversationMessage(
  playerId: string,
  body: string
): Promise<ActionResult> {
  const clean = body.trim().slice(0, MESSAGE_MAX_LENGTH);
  if (!clean) return { ok: false, error: "Le message est vide." };

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("conversation_messages")
    .insert({ player_id: playerId, sender_id: user.id, body: clean });
  if (error) return { ok: false, error: "Envoi impossible." };

  // écrire dans un fil vaut lecture de tout ce qui précède
  await supabase
    .from("conversation_reads")
    .upsert(
      { player_id: playerId, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "player_id,user_id" }
    );

  // Destinataires du push : les participants du fil moins l'expéditeur —
  // joueur, coach référent et parents. L'insert RLS a déjà prouvé l'accès ;
  // le service_role ne sert qu'à composer la notification.
  const admin = createAdminClient();
  const [{ data: player }, { data: senderProfile }, { data: parentLinks }] = await Promise.all([
    admin.from("players").select("coach_id").eq("id", playerId).maybeSingle(),
    admin.from("profiles").select("first_name, last_name, role").eq("id", user.id).maybeSingle(),
    admin.from("parent_links").select("parent_id").eq("player_id", playerId),
  ]);
  const senderName =
    `${senderProfile?.first_name ?? ""} ${senderProfile?.last_name ?? ""}`.trim() || "Un membre du staff";

  // chaque destinataire ouvre le fil dans SA propre interface
  const recipients = new Map<string, string>([[playerId, "/parametres"]]);
  if (player?.coach_id) recipients.set(player.coach_id, `/coach/joueurs/${playerId}`);
  for (const link of parentLinks ?? []) recipients.set(link.parent_id, "/parent/messages");
  recipients.delete(user.id);

  await Promise.all(
    [...recipients].map(([recipientId, url]) =>
      pushToUserIfEnabled(recipientId, {
        title:
          recipientId === playerId ? `Message de ${senderName} 💬` : `Message de ${senderName}`,
        body: excerpt(clean),
        url,
      })
    )
  );

  revalidatePath("/parametres");
  revalidatePath(`/coach/joueurs/${playerId}`);
  revalidatePath("/parent/messages");
  return { ok: true };
}

/** Marque le fil comme lu pour l'utilisateur courant (badge non-lu). */
export async function markConversationRead(playerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  const { error } = await supabase
    .from("conversation_reads")
    .upsert(
      { player_id: playerId, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "player_id,user_id" }
    );
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
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
      })
    )
  );

  revalidatePath("/coach/club");
  return { ok: true };
}

/** Suppression d'une annonce (admin uniquement via RLS). */
export async function deleteAnnouncement(announcementId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
  if (error) return { ok: false, error: "Suppression impossible." };
  revalidatePath("/coach/club");
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
