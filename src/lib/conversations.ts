import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { messagePreview } from "./attachments";
import { canUsePrivateChannels } from "./offers";
import { INBOX_SCAN_LIMIT, STAFF_UNREAD_SCAN_LIMIT, channelKey } from "./constants";
import type { AttachmentKind, ConversationChannel, PlayerOffer } from "./types";

/**
 * Canaux de discussion (migration 0034) — source unique du « qui a quels fils ».
 *
 *  * Fil coach & parents  : `adminId = null`, ouvert à tous les joueurs.
 *  * Fils privés          : un par admin, offre formation uniquement.
 *
 * La liste des admins passe par le service_role : la RLS de profiles ne laisse
 * pas un joueur lire le profil d'un admin qui n'est pas son coach, alors qu'il
 * doit voir « Lucas » et « Maxime » sur ses onglets. On n'expose que le prénom.
 */

export interface StaffAdmin {
  id: string;
  firstName: string;
}

/** Admins du club, par ordre alphabétique (ordre stable des onglets). */
export async function listStaffAdmins(): Promise<StaffAdmin[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, first_name")
    .eq("role", "admin")
    .order("first_name");
  return (data ?? []).map((p) => ({ id: p.id, firstName: p.first_name || "Staff" }));
}

/**
 * Porteurs possibles d'un fil privé avec ce joueur (0037) : son coach référent
 * d'abord, puis les admins. Un coach référent qui est aussi admin n'apparaît
 * qu'une fois. Service_role : la RLS de profiles ne donne pas ces noms à un
 * joueur — on n'expose que le prénom.
 */
export async function listPrivateChannelOwners(playerId: string): Promise<StaffAdmin[]> {
  const admin = createAdminClient();
  const [{ data: player }, admins] = await Promise.all([
    admin.from("players").select("coach_id").eq("id", playerId).maybeSingle(),
    listStaffAdmins(),
  ]);
  const coachId = player?.coach_id as string | null | undefined;
  if (!coachId || admins.some((a) => a.id === coachId)) return admins;

  const { data: coach } = await admin
    .from("profiles")
    .select("id, first_name")
    .eq("id", coachId)
    .maybeSingle();
  if (!coach) return admins;
  return [{ id: coach.id, firstName: coach.first_name || "Coach" }, ...admins];
}

/**
 * Y a-t-il, dans ce canal, un message plus récent que le dernier passage de
 * l'utilisateur — et écrit par quelqu'un d'autre ?
 *
 * Lecture sous RLS : un canal auquel l'appelant n'a pas accès ne renvoie rien,
 * donc jamais de pastille sur un fil qu'on ne peut pas ouvrir.
 */
async function channelHasUnread(
  supabase: SupabaseClient,
  playerId: string,
  viewerId: string,
  adminId: string | null,
  lastReadAt: string | null
): Promise<boolean> {
  let query = supabase
    .from("conversation_messages")
    .select("id")
    .eq("player_id", playerId)
    // les siens ne comptent pas ; un compte supprimé (sender null) non plus
    .neq("sender_id", viewerId)
    .limit(1);
  query = adminId ? query.eq("channel_admin_id", adminId) : query.is("channel_admin_id", null);
  if (lastReadAt) query = query.gt("created_at", lastReadAt);

  const { data } = await query;
  return (data ?? []).length > 0;
}

/**
 * Canaux qui ont du nouveau pour l'utilisateur, parmi ceux demandés. Sert au
 * rafraîchissement des pastilles pendant qu'un fil est ouvert (la liste des
 * canaux, elle, ne bouge pas).
 */
export async function getUnreadChannelKeys(
  supabase: SupabaseClient,
  playerId: string,
  viewerId: string,
  adminIds: (string | null)[]
): Promise<string[]> {
  const { data: reads } = await supabase
    .from("conversation_reads")
    .select("channel_admin_id, last_read_at")
    .eq("player_id", playerId)
    .eq("user_id", viewerId);

  const lastReadByChannel = new Map<string, string>(
    (reads ?? []).map((r) => [channelKey(r.channel_admin_id), r.last_read_at])
  );

  // canaux indépendants les uns des autres : une seule salve réseau
  const flags = await Promise.all(
    adminIds.map((adminId) =>
      channelHasUnread(
        supabase,
        playerId,
        viewerId,
        adminId,
        lastReadByChannel.get(channelKey(adminId)) ?? null
      )
    )
  );
  return adminIds.filter((_, i) => flags[i]).map((adminId) => channelKey(adminId));
}

/**
 * Canaux visibles par l'utilisateur courant dans le fil d'un joueur, avec leur
 * état non-lu. Sert au joueur (ses fils) comme au staff (fiche joueur).
 *
 * `includePrivate` :
 *  * `true`  — tous les fils privés (le joueur lui-même, les admins) ;
 *  * `"own"` — seulement le sien (le coach référent, 0037) ;
 *  * `false` — le fil global uniquement (les parents).
 */
export async function getConversationChannels(
  supabase: SupabaseClient,
  {
    playerId,
    viewerId,
    offer,
    includePrivate,
  }: {
    playerId: string;
    viewerId: string;
    offer: PlayerOffer;
    includePrivate: boolean | "own";
  }
): Promise<ConversationChannel[]> {
  const owners =
    includePrivate && canUsePrivateChannels(offer) ? await listPrivateChannelOwners(playerId) : [];
  const visible = includePrivate === "own" ? owners.filter((o) => o.id === viewerId) : owners;

  const wanted: { adminId: string | null; adminName: string | null }[] = [
    { adminId: null, adminName: null },
    ...visible.map((a) => ({ adminId: a.id, adminName: a.firstName })),
  ];

  const unread = new Set(
    await getUnreadChannelKeys(
      supabase,
      playerId,
      viewerId,
      wanted.map((c) => c.adminId)
    )
  );

  return wanted.map((c) => ({ ...c, hasUnread: unread.has(channelKey(c.adminId)) }));
}

// ---------------------------------------------------------------------------
// Pastille de la barre de navigation du joueur
// ---------------------------------------------------------------------------

/**
 * Messages balayés pour la pastille de la barre du bas. Les marqueurs de
 * lecture étant monotones (lire un message vaut lecture de tout ce qui
 * précède dans le canal), il suffit de regarder les derniers messages reçus :
 * si tous sont lus, tout ce qui est plus ancien l'est aussi.
 */
const NAV_UNREAD_SCAN = 30;

export interface NavUnreadInput {
  reads: { channel_admin_id: string | null; last_read_at: string }[];
  recent: { channel_admin_id: string | null; created_at: string }[];
}

/**
 * Lecture nécessaire à la pastille de navigation : deux requêtes lancées avec
 * le reste du layout (le verdict, lui, dépend de l'offre — cf. hasNavUnread).
 */
export async function fetchNavUnread(
  supabase: SupabaseClient,
  playerId: string
): Promise<NavUnreadInput> {
  const [{ data: reads }, { data: recent }] = await Promise.all([
    supabase
      .from("conversation_reads")
      .select("channel_admin_id, last_read_at")
      .eq("player_id", playerId)
      .eq("user_id", playerId),
    supabase
      .from("conversation_messages")
      .select("channel_admin_id, created_at")
      .eq("player_id", playerId)
      // ses propres messages ne se notifient pas
      .neq("sender_id", playerId)
      .order("created_at", { ascending: false })
      .limit(NAV_UNREAD_SCAN),
  ]);
  return { reads: reads ?? [], recent: recent ?? [] };
}

/**
 * Le joueur a-t-il du non-lu dans l'un de ses canaux ?
 *
 * Un joueur repassé en perf ne voit plus ses fils privés : on ignore leur
 * non-lu, sinon la pastille resterait allumée sur un onglet qu'il ne peut plus
 * ouvrir.
 */
export function hasNavUnread(input: NavUnreadInput, offer: PlayerOffer): boolean {
  const includePrivate = canUsePrivateChannels(offer);
  const lastReadByChannel = new Map(
    input.reads.map((r) => [channelKey(r.channel_admin_id), r.last_read_at])
  );
  return input.recent.some((m) => {
    if (m.channel_admin_id && !includePrivate) return false;
    const lastRead = lastReadByChannel.get(channelKey(m.channel_admin_id));
    return !lastRead || m.created_at > lastRead;
  });
}

// ---------------------------------------------------------------------------
// Pastilles de non-lu du staff
// ---------------------------------------------------------------------------

/**
 * Parmi ces joueurs, ceux dont un fil porte un message que le membre du staff
 * n'a pas lu.
 *
 * Sert à la pastille de l'onglet Joueurs et à celle de chaque carte de la
 * liste : un message raté ne doit jamais demander d'ouvrir les fiches une par
 * une pour être découvert.
 *
 * PÉRIMÈTRE — exactement celui de `getStaffInbox`, et c'est ce qui fait tenir
 * la pastille : une pastille qu'on ne peut pas éteindre est pire que pas de
 * pastille. La RLS est plus large que la boîte (0037 rend TOUS les fils privés
 * à un admin, y compris ceux de ses collègues), donc sans filtre explicite un
 * admin s'allumait sur le fil privé de l'autre admin — fil que sa boîte
 * n'affiche pas et qu'il ne peut donc jamais marquer lu. On ne retient donc :
 *
 *  - que le fil global (`channel_admin_id is null`) et SES propres fils privés,
 *  - et, pour les fils privés, que les joueurs en offre formation : un joueur
 *    repassé en perf perd l'onglet côté joueur comme le fil côté boîte
 *    (symétrique de `hasNavUnread`).
 *
 * Balayage borné à STAFF_UNREAD_SCAN_LIMIT messages récents. Les marqueurs de
 * lecture étant monotones par canal, le dernier message d'un fil tranche pour
 * tout le fil : remonter plus loin n'apprendrait rien, sauf si un seul fil
 * concentrait à lui seul des centaines de messages plus récents que le dernier
 * message non lu d'un autre.
 */
export async function getStaffUnreadPlayerIds(
  supabase: SupabaseClient,
  viewerId: string,
  playerIds: string[]
): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();

  const [{ data: messages }, { data: reads }, { data: formationRows }] = await Promise.all([
    supabase
      .from("conversation_messages")
      .select("player_id, channel_admin_id, created_at")
      .in("player_id", playerIds)
      // les siens ne comptent pas ; un compte supprimé (sender null) non plus
      .neq("sender_id", viewerId)
      // fil global + ses propres fils privés (cf. périmètre ci-dessus)
      .or(`channel_admin_id.is.null,channel_admin_id.eq.${viewerId}`)
      .order("created_at", { ascending: false })
      .limit(STAFF_UNREAD_SCAN_LIMIT),
    supabase
      .from("conversation_reads")
      .select("player_id, channel_admin_id, last_read_at")
      .in("player_id", playerIds)
      .eq("user_id", viewerId),
    supabase
      .from("players")
      .select("id")
      .in("id", playerIds)
      .eq("offer", "formation")
      .eq("status", "active"),
  ]);

  const lastReadByChannel = new Map(
    (reads ?? []).map((r) => [`${r.player_id}:${channelKey(r.channel_admin_id)}`, r.last_read_at])
  );
  const hasPrivateChannels = new Set((formationRows ?? []).map((p) => p.id));

  const unread = new Set<string>();
  for (const m of messages ?? []) {
    // fil privé d'un joueur repassé en perf : plus affiché nulle part
    if (m.channel_admin_id && !hasPrivateChannels.has(m.player_id)) continue;
    const seenAt = lastReadByChannel.get(`${m.player_id}:${channelKey(m.channel_admin_id)}`);
    if (!seenAt || m.created_at > seenAt) unread.add(m.player_id);
  }
  return unread;
}

/**
 * Les joueurs actifs « à moi » pour la pastille et le brief : ceux dont je
 * suis le référent, plus ceux des groupes dont je fais partie du staff (0040).
 * Filtre explicite : la RLS montre TOUS les joueurs à un admin, or la pastille
 * ne parle que de ce qui m'attend — et depuis les groupes, ce qui attend le
 * staff du groupe m'attend aussi.
 */
export async function getMyPlayerIds(supabase: SupabaseClient, staffId: string): Promise<string[]> {
  const { data: memberships } = await supabase
    .from("group_staff")
    .select("group_id")
    .eq("profile_id", staffId);
  const groupIds = (memberships ?? []).map((m) => m.group_id as string);

  let query = supabase.from("players").select("id").eq("status", "active");
  query =
    groupIds.length > 0
      ? query.or(`coach_id.eq.${staffId},group_id.in.(${groupIds.join(",")})`)
      : query.eq("coach_id", staffId);
  const { data: players } = await query;
  return (players ?? []).map((p) => p.id as string);
}

/** Le staff a-t-il du non-lu chez l'un de ses joueurs actifs ? */
export async function hasStaffUnread(
  supabase: SupabaseClient,
  staffId: string
): Promise<boolean> {
  const unread = await getStaffUnreadPlayerIds(
    supabase,
    staffId,
    await getMyPlayerIds(supabase, staffId)
  );
  return unread.size > 0;
}

// ---------------------------------------------------------------------------
// Boîtes de réception du staff
// ---------------------------------------------------------------------------

export interface InboxThread {
  playerId: string;
  playerName: string;
  /** null = fil coach & parents ; sinon fil privé porté par cet admin */
  channelAdminId: string | null;
  /** dernier message du fil, null si personne n'a encore écrit */
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  hasUnread: boolean;
}

/** Fils animés d'abord (du plus récent), fils muets en fin de liste. */
function byLastMessage(a: InboxThread, b: InboxThread): number {
  if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
  if (a.lastAt) return -1;
  if (b.lastAt) return 1;
  return a.playerName.localeCompare(b.playerName);
}

/**
 * TOUS les fils dont ce membre du staff est destinataire, du plus récemment
 * animé au plus ancien — la boîte de réception de la liste des joueurs.
 *
 *  * le fil global de chaque joueur du périmètre (`scope`, par défaut SES
 *    joueurs — la RLS rend tous les joueurs du club à un admin) ;
 *  * ses propres fils privés : un par joueur formation actif pour un admin,
 *    un par joueur formation qu'il encadre pour un coach référent (0037).
 *
 * Les fils privés d'un collègue ne sont PAS ici : ils ont leur propre onglet
 * (getAdminInbox), pour que « mes fils » veuille dire quelque chose.
 *
 * Un seul balayage de messages, borné à INBOX_SCAN_LIMIT : au-delà, un fil dont
 * le dernier message est très ancien s'affiche comme muet — même borne que
 * l'historique du fil lui-même, pas une perte de données.
 */
export async function getStaffInbox(
  supabase: SupabaseClient,
  viewerId: string,
  isAdmin: boolean,
  /**
   * Joueurs à couvrir. Par défaut, ceux dont il est le coach référent — c'est
   * le périmètre de l'accueil. La liste des joueurs, elle, passe TOUS les
   * joueurs qu'elle affiche (le club entier pour un admin) : elle sert de
   * boîte de réception et un fil ne doit pas y rester muet faute d'être
   * demandé ici. La RLS reste seule juge de ce qui se lit.
   */
  scope?: string[]
): Promise<InboxThread[]> {
  // fils privés portés par le lecteur : tous les joueurs formation pour un
  // admin, SES joueurs formation pour un coach référent (0037)
  let privateQuery = supabase
    .from("players")
    .select("id")
    .eq("offer", "formation")
    .eq("status", "active");
  if (scope) privateQuery = privateQuery.in("id", scope);
  if (!isAdmin) privateQuery = privateQuery.eq("coach_id", viewerId);

  const [{ data: globalPlayers }, { data: formationPlayers }] = await Promise.all([
    scope
      ? Promise.resolve({ data: scope.map((id) => ({ id })) })
      : supabase.from("players").select("id").eq("coach_id", viewerId).eq("status", "active"),
    privateQuery,
  ]);

  const wanted: { playerId: string; channelAdminId: string | null }[] = [
    ...(globalPlayers ?? []).map((p) => ({ playerId: p.id, channelAdminId: null })),
    ...(formationPlayers ?? []).map((p) => ({ playerId: p.id, channelAdminId: viewerId })),
  ];
  if (wanted.length === 0) return [];

  const playerIds = [...new Set(wanted.map((w) => w.playerId))];

  const [{ data: profiles }, { data: messages }, { data: reads }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name").in("id", playerIds),
    supabase
      .from("conversation_messages")
      .select("player_id, channel_admin_id, sender_id, body, created_at, attachment_kind")
      .in("player_id", playerIds)
      // sans ce filtre, un admin balaierait aussi les fils privés de ses
      // collègues (la RLS les lui rend) et pourrait épuiser la limite dessus
      .or(`channel_admin_id.is.null,channel_admin_id.eq.${viewerId}`)
      .order("created_at", { ascending: false })
      .limit(INBOX_SCAN_LIMIT),
    supabase
      .from("conversation_reads")
      .select("player_id, channel_admin_id, last_read_at")
      .in("player_id", playerIds)
      .eq("user_id", viewerId),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  );
  const lastReadByKey = new Map(
    (reads ?? []).map((r) => [`${r.player_id}:${channelKey(r.channel_admin_id)}`, r.last_read_at])
  );

  // messages triés du plus récent au plus ancien : le premier vu pour une paire
  // (joueur, canal) est le dernier message de ce fil
  const lastByKey = new Map<
    string,
    {
      body: string;
      created_at: string;
      sender_id: string | null;
      attachment_kind: AttachmentKind | null;
    }
  >();
  for (const m of messages ?? []) {
    const key = `${m.player_id}:${channelKey(m.channel_admin_id)}`;
    if (!lastByKey.has(key)) lastByKey.set(key, m);
  }

  return wanted
    .map(({ playerId, channelAdminId }) => {
      const key = `${playerId}:${channelKey(channelAdminId)}`;
      const last = lastByKey.get(key);
      const lastRead = lastReadByKey.get(key) ?? null;
      return {
        playerId,
        playerName: nameById.get(playerId) ?? "Joueur",
        channelAdminId,
        lastBody: last ? messagePreview(last) : null,
        lastAt: last?.created_at ?? null,
        lastFromMe: last?.sender_id === viewerId,
        hasUnread: Boolean(
          last && last.sender_id !== viewerId && (!lastRead || last.created_at > lastRead)
        ),
      };
    })
    .sort(byLastMessage);
}

/**
 * Tous les fils privés portés par un admin (un par joueur formation actif),
 * du plus récemment animé au plus ancien.
 *
 * `channelAdminId` est le porteur du fil, `viewerId` celui qui regarde : les
 * deux diffèrent quand un admin consulte les fils de son collègue (0034).
 *
 * Les messages sont lus en une requête bornée à INBOX_SCAN_LIMIT : au-delà, un
 * fil dont le dernier message est très ancien s'affiche comme vide — c'est la
 * même borne d'historique que le fil lui-même, pas une perte de données.
 */
export async function getAdminInbox(
  supabase: SupabaseClient,
  channelAdminId: string,
  viewerId: string
): Promise<InboxThread[]> {
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .eq("offer", "formation")
    .eq("status", "active");

  const playerIds = (players ?? []).map((p) => p.id);
  if (playerIds.length === 0) return [];

  const [{ data: profiles }, { data: messages }, { data: reads }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name").in("id", playerIds),
    supabase
      .from("conversation_messages")
      .select("player_id, sender_id, body, created_at, attachment_kind")
      .eq("channel_admin_id", channelAdminId)
      .order("created_at", { ascending: false })
      .limit(INBOX_SCAN_LIMIT),
    supabase
      .from("conversation_reads")
      .select("player_id, last_read_at")
      .eq("channel_admin_id", channelAdminId)
      .eq("user_id", viewerId),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  );
  const lastReadById = new Map((reads ?? []).map((r) => [r.player_id, r.last_read_at]));

  // messages triés du plus récent au plus ancien : le premier vu pour un
  // joueur est le dernier message de son fil
  const lastByPlayer = new Map<
    string,
    {
      body: string;
      created_at: string;
      sender_id: string | null;
      attachment_kind: AttachmentKind | null;
    }
  >();
  for (const m of messages ?? []) {
    if (!lastByPlayer.has(m.player_id)) lastByPlayer.set(m.player_id, m);
  }

  return playerIds
    .map((id) => {
      const last = lastByPlayer.get(id);
      const lastRead = lastReadById.get(id) ?? null;
      return {
        playerId: id,
        playerName: nameById.get(id) ?? "Joueur",
        channelAdminId,
        // un vocal ou une photo n'a pas de texte : l'aperçu annonce sa nature
        lastBody: last ? messagePreview(last) : null,
        lastAt: last?.created_at ?? null,
        lastFromMe: last?.sender_id === viewerId,
        hasUnread: Boolean(
          last && last.sender_id !== viewerId && (!lastRead || last.created_at > lastRead)
        ),
      };
    })
    .sort(byLastMessage);
}
