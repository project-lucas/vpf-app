import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { messagePreview } from "./attachments";
import { INBOX_SCAN_LIMIT, STAFF_UNREAD_SCAN_LIMIT } from "./constants";
import {
  CHANNEL_MEMBERS,
  CHANNEL_ORDER,
  channelId,
  channelLabel,
  onChannel,
  parseChannelId,
  refOfRow,
  type ChannelKind,
  type ChannelRef,
} from "./channels";
import type { AttachmentKind, ConversationChannel } from "./types";

/**
 * Qui a quels fils (0048) — source unique côté application. La RLS
 * (`can_read_channel`) reste seule juge de ce qui se lit ; ici on décide de ce
 * qu'on AFFICHE à chacun, et sous quel nom.
 *
 * Les prénoms du staff passent par le service_role : la RLS de profiles ne les
 * donne pas à un joueur ni à un parent. On n'expose que le prénom.
 */

export type Viewer = "player" | "parent" | "coach" | "admin";

/** Les titulaires des rôles d'un joueur : référent, coachs technique et physique. */
export interface ChannelHolders {
  coachId: string | null;
  technique: string | null;
  physique: string | null;
}

/** Titulaires des rôles pour ces joueurs (service_role, ids seulement). */
export async function getChannelHolders(playerIds: string[]): Promise<Map<string, ChannelHolders>> {
  const out = new Map<string, ChannelHolders>();
  if (playerIds.length === 0) return out;
  // une seule requête : le joueur, son groupe et le staff à rôle du groupe
  const { data: players } = await createAdminClient()
    .from("players")
    .select("id, coach_id, group:groups(group_staff(profile_id, role))")
    .in("id", playerIds);
  for (const p of players ?? []) {
    const group = Array.isArray(p.group) ? p.group[0] : p.group;
    const staff = ((group as { group_staff?: { profile_id: string; role: string | null }[] } | null)?.group_staff ??
      []) as { profile_id: string; role: string | null }[];
    out.set(p.id as string, {
      coachId: (p.coach_id as string | null) ?? null,
      technique: staff.find((r) => r.role === "technique")?.profile_id ?? null,
      physique: staff.find((r) => r.role === "physique")?.profile_id ?? null,
    });
  }
  return out;
}

async function firstNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, first_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, (p.first_name as string) || "Staff"]));
}

/** Les fils qu'un lecteur voit dans la conversation d'un joueur (avant non-lu). */
function visibleKinds(viewer: Viewer, viewerId: string, holders: ChannelHolders | undefined): ChannelKind[] {
  const has = (k: "technique" | "physique") => Boolean(holders?.[k]);
  switch (viewer) {
    case "parent":
      return ["global", "parents"];
    case "player":
      return [
        "global",
        ...(holders?.coachId ? (["referent"] as const) : []),
        ...(has("technique") ? (["technique"] as const) : []),
        ...(has("physique") ? (["physique"] as const) : []),
      ];
    case "admin":
      return [
        "global",
        ...(holders?.coachId ? (["referent"] as const) : []),
        ...(has("technique") ? (["technique"] as const) : []),
        ...(has("physique") ? (["physique"] as const) : []),
        "parents",
      ];
    case "coach":
      return [
        "global",
        ...(holders?.coachId === viewerId ? (["referent"] as const) : []),
        ...(holders?.technique === viewerId ? (["technique"] as const) : []),
        ...(holders?.physique === viewerId ? (["physique"] as const) : []),
        "parents",
      ];
  }
}

/** Le dernier message d'un fil et son non-lu pour ce lecteur (lecture RLS). */
async function channelState(
  supabase: SupabaseClient,
  playerId: string,
  viewerId: string,
  ref: ChannelRef,
  lastReadAt: string | null
): Promise<{ last: ConversationChannel["last"]; hasUnread: boolean }> {
  const { data } = await onChannel(
    supabase
      .from("conversation_messages")
      .select("sender_id, body, created_at, attachment_kind, is_system")
      .eq("player_id", playerId),
    ref
  )
    .order("created_at", { ascending: false })
    .limit(1);
  const m = data?.[0];
  if (!m) return { last: null, hasUnread: false };
  // les siens ne comptent pas ; un rappel « VPF » (sans auteur) ne compte que
  // pour le joueur à qui il s'adresse
  const counts =
    m.sender_id !== viewerId && (viewerId === playerId ? true : !m.is_system && m.sender_id !== null);
  return {
    last: {
      body: messagePreview({ body: m.body, attachment_kind: m.attachment_kind as AttachmentKind | null }),
      at: m.created_at as string,
      fromMe: m.sender_id === viewerId,
      senderId: (m.sender_id as string | null) ?? null,
      isSystem: Boolean(m.is_system),
      fromName: null,
    },
    hasUnread: counts && (!lastReadAt || (m.created_at as string) > lastReadAt),
  };
}

/**
 * Les fils de la conversation d'un joueur, tels que ce lecteur les voit : nom,
 * membres, dernier message, non-lu, droit d'écrire. Triés comme une liste de
 * discussions WhatsApp : par activité, Global en tête à égalité.
 */
export async function getConversationChannels(
  supabase: SupabaseClient,
  { playerId, viewerId, viewer }: { playerId: string; viewerId: string; viewer: Viewer }
): Promise<ConversationChannel[]> {
  const holders = (await getChannelHolders([playerId])).get(playerId);
  const kinds = visibleKinds(viewer, viewerId, holders);

  // anciens fils privés (avant 0048) qui ont des messages : en lecture seule
  const legacyOwners: string[] = [];
  if (viewer !== "parent") {
    const { data: legacy } = await supabase
      .from("conversation_messages")
      .select("channel_admin_id")
      .eq("player_id", playerId)
      .eq("channel", "legacy")
      .limit(200);
    for (const l of legacy ?? []) {
      const owner = l.channel_admin_id as string | null;
      if (owner && !legacyOwners.includes(owner) && (viewer !== "coach" || owner === viewerId)) {
        legacyOwners.push(owner);
      }
    }
  }

  const refs: ChannelRef[] = [
    ...kinds.map((kind) => ({ kind, ownerId: null })),
    ...legacyOwners.map((ownerId) => ({ kind: "legacy" as const, ownerId })),
  ];

  const [{ data: reads }, names] = await Promise.all([
    supabase
      .from("conversation_reads")
      .select("channel, channel_admin_id, last_read_at")
      .eq("player_id", playerId)
      .eq("user_id", viewerId),
    firstNames([holders?.coachId ?? "", holders?.technique ?? "", holders?.physique ?? "", ...legacyOwners]),
  ]);
  const lastRead = new Map((reads ?? []).map((r) => [channelId(refOfRow(r)), r.last_read_at as string]));

  const states = await Promise.all(
    refs.map((ref) => channelState(supabase, playerId, viewerId, ref, lastRead.get(channelId(ref)) ?? null))
  );
  // l'auteur du dernier message, pour l'aperçu « Lucas : … »
  const senderNames = await firstNames(
    states.map((s) => s.last?.senderId ?? "").filter((id) => id && !names.has(id))
  );
  for (const s of states) {
    if (!s.last) continue;
    s.last.fromName = s.last.isSystem
      ? "VPF"
      : s.last.fromMe
        ? "Toi"
        : (s.last.senderId && (names.get(s.last.senderId) ?? senderNames.get(s.last.senderId))) || null;
  }

  const holderOf = (ref: ChannelRef): string | null => {
    if (ref.kind === "legacy") return ref.ownerId;
    if (ref.kind === "referent") return holders?.coachId ?? null;
    if (ref.kind === "technique") return holders?.technique ?? null;
    if (ref.kind === "physique") return holders?.physique ?? null;
    return null;
  };

  return refs
    .map((ref, i) => {
      const holder = holderOf(ref);
      return {
        id: channelId(ref),
        kind: ref.kind,
        ownerId: ref.ownerId,
        label: channelLabel(ref.kind, holder ? (names.get(holder) ?? null) : null),
        members: CHANNEL_MEMBERS[ref.kind],
        canWrite: ref.kind !== "legacy",
        hasUnread: states[i].hasUnread,
        last: states[i].last,
      };
    })
    .sort((a, b) => {
      // non lus en tête : ce qui attend une réponse se voit d'abord
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      if (a.last && b.last && a.last.at !== b.last.at) return a.last.at < b.last.at ? 1 : -1;
      if (a.last && !b.last) return -1;
      if (!a.last && b.last) return 1;
      return CHANNEL_ORDER[a.kind] - CHANNEL_ORDER[b.kind];
    });
}

// ---------------------------------------------------------------------------
// Pastille de la barre de navigation (joueur, parent)
// ---------------------------------------------------------------------------

/**
 * Messages balayés pour la pastille de la barre du bas. Les marqueurs de
 * lecture sont monotones par fil : si les derniers messages reçus sont lus,
 * tout ce qui est plus ancien l'est aussi.
 */
const NAV_UNREAD_SCAN = 40;

/**
 * Du non-lu dans l'un des fils du joueur (ou, pour un parent, de son enfant) ?
 * La RLS ne rend que les fils de ce lecteur : un parent ne voit jamais un fil
 * Technique, un joueur jamais le fil Parents.
 */
export async function hasFamilyUnread(
  supabase: SupabaseClient,
  playerId: string,
  viewerId: string
): Promise<boolean> {
  const [{ data: reads }, { data: recent }] = await Promise.all([
    supabase
      .from("conversation_reads")
      .select("channel, channel_admin_id, last_read_at")
      .eq("player_id", playerId)
      .eq("user_id", viewerId),
    supabase
      .from("conversation_messages")
      .select("channel, channel_admin_id, created_at, sender_id, is_system")
      .eq("player_id", playerId)
      // ses propres messages ne se notifient pas ; un rappel « VPF » (sans
      // auteur) seulement au joueur — `<>` exclurait les NULL, d'où le `or`
      .or(`sender_id.is.null,sender_id.neq.${viewerId}`)
      .order("created_at", { ascending: false })
      .limit(NAV_UNREAD_SCAN),
  ]);
  const lastRead = new Map((reads ?? []).map((r) => [channelId(refOfRow(r)), r.last_read_at as string]));
  return (recent ?? []).some((m) => {
    if (m.is_system && viewerId !== playerId) return false;
    const seen = lastRead.get(channelId(refOfRow(m)));
    return !seen || (m.created_at as string) > seen;
  });
}

// ---------------------------------------------------------------------------
// Pastilles et boîte de réception du staff
// ---------------------------------------------------------------------------

/**
 * Les fils d'un joueur qui « sont à moi » : Global et Parents pour tout le
 * staff du joueur, plus les fils dont je tiens le rôle (référent, technique,
 * physique). Un admin lit tous les fils (supervision) mais ne s'allume que
 * sur les siens : une pastille qu'on ne peut pas éteindre est pire que rien.
 */
function myKinds(viewerId: string, holders: ChannelHolders | undefined): Set<ChannelKind> {
  const kinds = new Set<ChannelKind>(["global", "parents"]);
  if (holders?.coachId === viewerId) kinds.add("referent");
  if (holders?.technique === viewerId) kinds.add("technique");
  if (holders?.physique === viewerId) kinds.add("physique");
  return kinds;
}

/**
 * Les auteurs « famille » (joueur, parent) parmi ces ids : un fil dont le
 * dernier message vient d'eux ATTEND le staff. Un message du staff — le mien
 * ou celui d'un collègue — y répond pour tout le monde (service_role : la RLS
 * de profiles ne donne pas le rôle des parents au staff).
 */
export async function familySenderIds(ids: (string | null)[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Set();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .in("id", unique)
    .in("role", ["player", "parent"]);
  return new Set((data ?? []).map((p) => p.id as string));
}

/**
 * Les messages que le staff a choisi de ne pas relancer (« Pas besoin de
 * répondre » dans la file Jarvis) : ils n'attendent plus personne.
 */
async function dismissedMessageIds(supabase: SupabaseClient, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const { data } = await supabase
    .from("jarvis_drafts")
    .select("period")
    .eq("kind", "message_reply")
    .eq("status", "dismissed")
    .in("period", messageIds);
  return new Set((data ?? []).map((d) => d.period as string));
}

/**
 * Parmi ces joueurs, ceux dont un de MES fils porte du nouveau que je n'ai
 * pas lu. Même périmètre que `getStaffInbox` : la pastille, la liste et la
 * boîte disent la même chose.
 *
 * Côté staff (`staff: true`), un fil n'attend que si son dernier message
 * vient de la famille : dès qu'un membre du staff a répondu, la pastille
 * s'éteint pour tous — deux coachs ne répondent plus au même message. Côté
 * parent, tout message non lu d'un autre compte compte.
 */
export async function getStaffUnreadPlayerIds(
  supabase: SupabaseClient,
  viewerId: string,
  playerIds: string[],
  { staff = false }: { staff?: boolean } = {}
): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();

  let query = supabase
    .from("conversation_messages")
    .select("id, player_id, channel, channel_admin_id, sender_id, created_at")
    .in("player_id", playerIds)
    // un compte supprimé (sender null) ne compte pas ; ni les rappels
    // automatiques « VPF », adressés au joueur
    .not("sender_id", "is", null)
    .eq("is_system", false)
    .neq("channel", "legacy");
  // côté parent, les siens ne comptent pas ; côté staff il faut les voir pour
  // savoir qui a écrit en dernier
  if (!staff) query = query.neq("sender_id", viewerId);
  const [{ data: messages }, { data: reads }, holders] = await Promise.all([
    query.order("created_at", { ascending: false }).limit(STAFF_UNREAD_SCAN_LIMIT),
    supabase
      .from("conversation_reads")
      .select("player_id, channel, channel_admin_id, last_read_at")
      .in("player_id", playerIds)
      .eq("user_id", viewerId),
    getChannelHolders(playerIds),
  ]);

  const lastRead = new Map(
    (reads ?? []).map((r) => [`${r.player_id}:${channelId(refOfRow(r))}`, r.last_read_at as string])
  );
  // le dernier message de chaque fil (tri décroissant : le premier vu)
  const latest = new Map<string, NonNullable<typeof messages>[number]>();
  for (const m of messages ?? []) {
    const ref = refOfRow(m);
    if (!myKinds(viewerId, holders.get(m.player_id as string)).has(ref.kind)) continue;
    const key = `${m.player_id}:${channelId(ref)}`;
    if (!latest.has(key)) latest.set(key, m);
  }
  const unseen = [...latest.entries()].filter(([key, m]) => {
    const seen = lastRead.get(key);
    return !seen || (m.created_at as string) > seen;
  });
  if (!staff) return new Set(unseen.map(([, m]) => m.player_id as string));

  const [family, dismissed] = await Promise.all([
    familySenderIds(unseen.map(([, m]) => m.sender_id as string)),
    dismissedMessageIds(
      supabase,
      unseen.map(([, m]) => m.id as string)
    ),
  ]);
  return new Set(
    unseen
      .filter(([, m]) => family.has(m.sender_id as string) && !dismissed.has(m.id as string))
      .map(([, m]) => m.player_id as string)
  );
}

/**
 * Les joueurs actifs « à moi » pour la pastille et le brief : ceux dont je
 * suis le référent, plus ceux des groupes dont je fais partie du staff (0040).
 */
export async function getMyPlayerIds(supabase: SupabaseClient, staffId: string): Promise<string[]> {
  // deux lectures en parallèle (un seul aller-retour) : mes référés, et les
  // joueurs des groupes dont je fais partie du staff
  const [{ data: own }, { data: memberships }] = await Promise.all([
    supabase.from("players").select("id").eq("status", "active").eq("coach_id", staffId),
    supabase.from("group_staff").select("group:groups(players(id, status))").eq("profile_id", staffId),
  ]);
  const ids = new Set((own ?? []).map((p) => p.id as string));
  for (const m of memberships ?? []) {
    const group = (Array.isArray(m.group) ? m.group[0] : m.group) as { players?: { id: string; status: string }[] } | null;
    for (const p of group?.players ?? []) if (p.status === "active") ids.add(p.id);
  }
  return [...ids];
}

/** Le staff a-t-il du non-lu chez l'un de ses joueurs actifs ? */
export async function hasStaffUnread(supabase: SupabaseClient, staffId: string): Promise<boolean> {
  const unread = await getStaffUnreadPlayerIds(supabase, staffId, await getMyPlayerIds(supabase, staffId), {
    staff: true,
  });
  return unread.size > 0;
}

export interface InboxThread {
  playerId: string;
  playerName: string;
  /** identifiant du fil (cf. channels.ts) : `global`, `technique`… */
  channel: string;
  /** nom du fil : « Technique », « Parents »… */
  channelName: string;
  /** dernier message du fil, null si personne n'a encore écrit */
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  /** id du dernier message (la file Jarvis y accroche son brouillon de réponse) */
  lastMessageId: string | null;
  /** le dernier message vient de la famille et personne du staff n'y a répondu */
  awaiting: boolean;
  /** il attend ET je ne l'ai pas encore lu : c'est la pastille */
  hasUnread: boolean;
}

/** Non lus d'abord, puis du plus récent au plus ancien, fils muets en fin de liste. */
function byLastMessage(a: InboxThread, b: InboxThread): number {
  if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
  if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
  if (a.lastAt) return -1;
  if (b.lastAt) return 1;
  return a.playerName.localeCompare(b.playerName);
}

/**
 * TOUS mes fils (cf. `myKinds`) chez ces joueurs, du plus récemment animé au
 * plus ancien — une ligne par (joueur, fil), comme une liste de discussions.
 * Par défaut, les joueurs dont je suis le référent. Un seul balayage borné à
 * INBOX_SCAN_LIMIT : au-delà, un fil très ancien s'affiche comme muet.
 */
export async function getStaffInbox(
  supabase: SupabaseClient,
  viewerId: string,
  _isAdmin: boolean,
  scope?: string[]
): Promise<InboxThread[]> {
  const playerIds =
    scope ??
    (
      await supabase.from("players").select("id").eq("coach_id", viewerId).eq("status", "active")
    ).data?.map((p) => p.id as string) ??
    [];
  if (playerIds.length === 0) return [];

  const [{ data: profiles }, { data: messages }, { data: reads }, holders] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name").in("id", playerIds),
    supabase
      .from("conversation_messages")
      .select("id, player_id, channel, channel_admin_id, sender_id, body, created_at, attachment_kind")
      .in("player_id", playerIds)
      .neq("channel", "legacy")
      // la boîte du staff parle des échanges humains : un rappel automatique
      // « VPF » ne la remonte pas et ne l'allume pas
      .eq("is_system", false)
      .order("created_at", { ascending: false })
      .limit(INBOX_SCAN_LIMIT),
    supabase
      .from("conversation_reads")
      .select("player_id, channel, channel_admin_id, last_read_at")
      .in("player_id", playerIds)
      .eq("user_id", viewerId),
    getChannelHolders(playerIds),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
  const lastRead = new Map(
    (reads ?? []).map((r) => [`${r.player_id}:${channelId(refOfRow(r))}`, r.last_read_at as string])
  );
  const lastByKey = new Map<
    string,
    { id: string; body: string; created_at: string; sender_id: string | null; attachment_kind: AttachmentKind | null }
  >();
  for (const m of messages ?? []) {
    const key = `${m.player_id}:${channelId(refOfRow(m))}`;
    if (!lastByKey.has(key)) lastByKey.set(key, m);
  }
  // « en attente » = le dernier message vient de la famille, sans réponse du
  // staff (de qui que ce soit) et sans décision « pas besoin de répondre »
  const lasts = [...lastByKey.values()];
  const [family, dismissed] = await Promise.all([
    familySenderIds(lasts.map((m) => m.sender_id)),
    dismissedMessageIds(
      supabase,
      lasts.filter((m) => m.sender_id && m.sender_id !== viewerId).map((m) => m.id)
    ),
  ]);

  const threads: InboxThread[] = [];
  for (const playerId of playerIds) {
    for (const kind of myKinds(viewerId, holders.get(playerId))) {
      const key = `${playerId}:${kind}`;
      const last = lastByKey.get(key);
      // Parents : un fil sans message n'a pas besoin d'encombrer la liste
      if (kind !== "global" && !last) continue;
      const seen = lastRead.get(key) ?? null;
      const awaiting = Boolean(last?.sender_id && family.has(last.sender_id) && !dismissed.has(last.id));
      threads.push({
        playerId,
        playerName: nameById.get(playerId) ?? "Joueur",
        channel: kind,
        channelName: channelLabel(kind, null),
        lastBody: last ? messagePreview(last) : null,
        lastAt: last?.created_at ?? null,
        lastFromMe: last?.sender_id === viewerId,
        lastMessageId: last?.id ?? null,
        awaiting,
        hasUnread: Boolean(awaiting && last && (!seen || last.created_at > seen)),
      });
    }
  }
  return threads.sort(byLastMessage);
}

/**
 * Parmi ces fils, ceux qui portent du nouveau pour ce lecteur. Rafraîchit les
 * pastilles pendant qu'un fil est ouvert ; la RLS fait foi, un fil hors de
 * portée ne renvoie jamais rien.
 */
export async function getUnreadChannelIds(
  supabase: SupabaseClient,
  playerId: string,
  viewerId: string,
  ids: string[]
): Promise<string[]> {
  const { data: reads } = await supabase
    .from("conversation_reads")
    .select("channel, channel_admin_id, last_read_at")
    .eq("player_id", playerId)
    .eq("user_id", viewerId);
  const lastRead = new Map((reads ?? []).map((r) => [channelId(refOfRow(r)), r.last_read_at as string]));
  const states = await Promise.all(
    ids.map((id) => {
      const ref = parseChannelId(id);
      return channelState(supabase, playerId, viewerId, ref, lastRead.get(channelId(ref)) ?? null);
    })
  );
  return ids.filter((_, i) => states[i].hasUnread);
}
