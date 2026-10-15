import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJarvisStructured } from "./jarvis-model";
import { getPlayerMemories, memoryAsText } from "./player-memory";
import { getPainContext, PAIN_RULE } from "./pain-context";
import { CHANNEL_NAMES, type ChannelKind } from "./channels";
import { messagePreview } from "./attachments";
import { MESSAGE_MAX_LENGTH } from "./constants";
import type { AttachmentKind } from "./types";
import {
  callTimeout,
  CONTEXT,
  markFailed,
  PRIVATE_RULE,
  releaseOldErrors,
  runChunks,
  saveDrafts,
  TONE,
  WriteError,
  type Ctx,
} from "./jarvis-runner";

/**
 * Deux chantiers de Jarvis qui répondent à ce que la famille vient d'écrire :
 *  - les messages restés sans réponse du staff (`message_reply`) — le geste
 *    le plus fréquent du service ;
 *  - les feuilles de match des derniers jours (`match_reply`) — le moment où
 *    le joueur est le plus réceptif.
 * Rien ne part d'ici : le staff valide dans la file « Aujourd'hui ».
 */

const SIZES = { message: 6, match: 8 } as const;
/** On ne prépare pas de réponse à un message plus vieux (il a été traité autrement). */
const MESSAGE_WINDOW_DAYS = 30;
/** Une feuille de match reçoit un retour dans les jours qui suivent, pas après. */
const MATCH_WINDOW_DAYS = 4;
const THREAD_CONTEXT = 8;

const ROLE_LABELS: Record<string, string> = { player: "joueur", parent: "parent", coach: "staff", admin: "staff" };

// ---------------------------------------------------------------------------
// Messages en attente
// ---------------------------------------------------------------------------

export interface AwaitingThread {
  messageId: string;
  playerId: string;
  channel: ChannelKind;
  senderRole: "player" | "parent";
  at: string;
}

/**
 * Les fils dont le dernier message (humain) vient de la famille, sur tout le
 * club : la même règle que « message en attente » côté staff
 * (`getStaffInbox`), lue en service_role.
 */
export async function getAwaitingThreads(admin: SupabaseClient, days = MESSAGE_WINDOW_DAYS): Promise<AwaitingThread[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: messages } = await admin
    .from("conversation_messages")
    .select("id, player_id, channel, sender_id, created_at, player:players!inner(status)")
    .eq("is_system", false)
    .eq("player.status", "active")
    .neq("channel", "legacy")
    .not("sender_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(3000);
  const latest = new Map<string, NonNullable<typeof messages>[number]>();
  for (const m of messages ?? []) {
    const key = `${m.player_id}:${m.channel}`;
    if (!latest.has(key)) latest.set(key, m);
  }
  const senders = [...new Set([...latest.values()].map((m) => m.sender_id as string))];
  if (senders.length === 0) return [];
  const { data: roles } = await admin.from("profiles").select("id, role").in("id", senders);
  const roleById = new Map((roles ?? []).map((r) => [r.id as string, r.role as string]));
  const out: AwaitingThread[] = [];
  for (const m of latest.values()) {
    const role = roleById.get(m.sender_id as string);
    if (role !== "player" && role !== "parent") continue;
    out.push({
      messageId: m.id as string,
      playerId: m.player_id as string,
      channel: m.channel as ChannelKind,
      senderRole: role,
      at: m.created_at as string,
    });
  }
  // « pas besoin de répondre » (file Jarvis) : le message n'attend plus personne
  if (out.length === 0) return out;
  const { data: dismissed } = await admin
    .from("jarvis_drafts")
    .select("period")
    .eq("kind", "message_reply")
    .eq("status", "dismissed")
    .in("period", out.map((t) => t.messageId));
  const skip = new Set((dismissed ?? []).map((d) => d.period as string));
  return out.filter((t) => !skip.has(t.messageId));
}

const MessageOut = z.object({
  replies: z.array(z.object({ messageId: z.string(), reply: z.string(), reason: z.string() })),
});

const MESSAGE_SYSTEM = `${CONTEXT}

Des messages de joueurs ou de parents attendent une réponse du staff. Pour chacun, tu rédiges la réponse que le coach enverra dans le MÊME fil, sous son nom (n'écris pas de signature). Le coach la relira et la corrigera si besoin.

Qui lit quoi : le fil « Global » est lu par le joueur, ses parents et le staff ; « Parents » par les parents et le staff seulement (jamais le joueur) ; « Référent », « Technique », « Physique » par le joueur et son coach.

La réponse : 1 à 3 phrases, au plus 500 signes. Elle répond à ce qui a été écrit (la question, la demande, la nouvelle), dans la continuité des derniers échanges. Tu t'adresses à l'auteur du dernier message : tutoiement et prénom pour le joueur ; vouvoiement pour un parent. Si la réponse demande une information que tu n'as pas (un horaire, une date, une décision du staff), ne l'invente pas : dis qu'on vérifie et qu'on revient vers lui, ou pose la question utile. Un simple merci ou un pouce appelle une réponse très courte et chaleureuse.

${PRIVATE_RULE}

${TONE}

${PAIN_RULE}

Pour chaque message, renvoie messageId (tel quel), reply, et reason : en une phrase pour le coach, ce que demande le message et sur quoi s'appuie ta réponse.`;

export async function prepareMessageReplies(ctx: Ctx): Promise<number> {
  const threads = await getAwaitingThreads(ctx.admin);
  if (threads.length === 0) return 0;
  await releaseOldErrors(ctx, "message_reply");
  const { data: existing } = await ctx.admin
    .from("jarvis_drafts")
    .select("period")
    .eq("kind", "message_reply")
    .in("period", threads.map((t) => t.messageId));
  const drafted = new Set((existing ?? []).map((d) => d.period as string));
  const todo = threads.filter((t) => !drafted.has(t.messageId));
  if (todo.length === 0) return 0;

  const playerIds = [...new Set(todo.map((t) => t.playerId))];
  const [memories, pain, { data: names }] = await Promise.all([
    getPlayerMemories(ctx.admin, playerIds),
    getPainContext(ctx.admin, playerIds),
    ctx.admin.from("profiles").select("id, first_name").in("id", playerIds),
  ]);
  const firstName = new Map((names ?? []).map((p) => [p.id as string, p.first_name as string]));

  return runChunks(ctx, todo, SIZES.message, async (chunk) => {
    // les derniers échanges de chaque fil, dans l'ordre chronologique
    const histories = await Promise.all(
      chunk.map(async (t) => {
        const { data } = await ctx.admin
          .from("conversation_messages")
          .select("sender_id, is_system, body, attachment_kind, created_at, sender:profiles!conversation_messages_sender_id_fkey(first_name, role)")
          .eq("player_id", t.playerId)
          .eq("channel", t.channel)
          .order("created_at", { ascending: false })
          .limit(THREAD_CONTEXT);
        return [...(data ?? [])].reverse().map((m) => {
          const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
          return {
            de: m.is_system ? "message automatique VPF" : `${ROLE_LABELS[sender?.role ?? ""] ?? "?"} ${sender?.first_name ?? ""}`.trim(),
            texte: messagePreview({ body: (m.body as string) ?? "", attachment_kind: m.attachment_kind as AttachmentKind | null }, 600),
            le: (m.created_at as string).slice(0, 16).replace("T", " "),
          };
        });
      })
    );
    const input = chunk.map((t, i) => ({
      messageId: t.messageId,
      prenomJoueur: firstName.get(t.playerId) ?? "",
      fil: CHANNEL_NAMES[t.channel] ?? t.channel,
      auteurDuDernierMessage: t.senderRole === "parent" ? "un parent" : "le joueur",
      derniersEchanges: histories[i],
      douleur: pain.get(t.playerId)?.text ?? "",
      ficheMemoire: memoryAsText(memories.get(t.playerId)),
    }));
    try {
      const { data, model } = await askJarvisStructured({
        schema: MessageOut,
        system: MESSAGE_SYSTEM,
        prompt: `Messages en attente (JSON) :\n${JSON.stringify(input)}`,
        effort: "low",
        timeoutMs: callTimeout(ctx),
      });
      const byId = new Map(data.replies.map((x) => [x.messageId, x]));
      const rows = chunk.map((t) => {
        const out = byId.get(t.messageId);
        return {
          kind: "message_reply",
          player_id: t.playerId,
          period: t.messageId,
          channel: t.channel,
          body: out?.reply.trim().slice(0, MESSAGE_MAX_LENGTH) ?? "",
          reason: out?.reason.trim().slice(0, 300) ?? "",
          status: out?.reply.trim() ? "pending" : "error",
          model,
        };
      });
      await saveDrafts(ctx, rows);
      return rows.filter((x) => x.status === "pending").length;
    } catch (err) {
      if (err instanceof WriteError) throw err;
      await markFailed(
        ctx,
        "message_reply",
        chunk.map((t) => ({ playerId: t.playerId, period: t.messageId, reviewId: null, channel: t.channel })),
        err
      );
      return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Feuilles de match
// ---------------------------------------------------------------------------

const MatchOut = z.object({
  replies: z.array(z.object({ matchId: z.string(), reply: z.string(), reason: z.string() })),
});

const MATCH_SYSTEM = `${CONTEXT}

Des joueurs viennent de remplir leur feuille de match. Pour chacun, tu rédiges le retour du coach, qui partira dans le fil Global (lu aussi par les parents) après relecture. Pas de signature.

Le retour : 2 à 3 phrases, au plus 450 signes. Il cite un ou deux chiffres du match (points, tirs, lancers francs, minutes), les compare à ses matchs précédents quand c'est parlant (« ton meilleur total depuis un mois »), salue ce qui a marché, et donne UN point à travailler cette semaine, concret et lié à ce qu'on voit. Un match difficile (peu de points, peu de minutes, beaucoup de fautes) se dit avec bienveillance : on garde le positif et un cap. Jamais de comparaison avec un autre joueur.

${PRIVATE_RULE}

${TONE}

${PAIN_RULE}

Pour chaque feuille, renvoie matchId (tel quel), reply, et reason : en une phrase pour le coach, ce qui ressort du match.`;

export async function prepareMatchReplies(ctx: Ctx): Promise<number> {
  const since = new Date(Date.now() - MATCH_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: sheets } = await ctx.admin
    .from("match_stats")
    .select(
      "id, player_id, match_date, points, minutes, is_starter, twos_inside_made, twos_outside_made, threes_made, free_throws_made, fouls, player:players!inner(status)"
    )
    .eq("player.status", "active")
    .gte("created_at", since);
  if (!sheets || sheets.length === 0) return 0;
  await releaseOldErrors(ctx, "match_reply");
  const { data: existing } = await ctx.admin
    .from("jarvis_drafts")
    .select("period")
    .eq("kind", "match_reply")
    .in("period", sheets.map((s) => s.id as string));
  const drafted = new Set((existing ?? []).map((d) => d.period as string));
  const todo = sheets.filter((s) => !drafted.has(s.id as string));
  if (todo.length === 0) return 0;

  const playerIds = [...new Set(todo.map((s) => s.player_id as string))];
  const [memories, pain, { data: names }, { data: previous }] = await Promise.all([
    getPlayerMemories(ctx.admin, playerIds),
    getPainContext(ctx.admin, playerIds),
    ctx.admin.from("profiles").select("id, first_name").in("id", playerIds),
    ctx.admin
      .from("match_stats")
      .select("id, player_id, match_date, points, minutes")
      .in("player_id", playerIds)
      .order("match_date", { ascending: false })
      .limit(playerIds.length * 8),
  ]);
  const firstName = new Map((names ?? []).map((p) => [p.id as string, p.first_name as string]));

  return runChunks(ctx, todo, SIZES.match, async (chunk) => {
    const input = chunk.map((s) => {
      const before = (previous ?? [])
        .filter((p) => p.player_id === s.player_id && p.id !== s.id && (p.match_date as string) <= (s.match_date as string))
        .slice(0, 5);
      return {
        matchId: s.id,
        prenom: firstName.get(s.player_id as string) ?? "",
        date: s.match_date,
        titulaire: s.is_starter,
        minutes: s.minutes,
        points: s.points,
        deuxPointsInterieur: s.twos_inside_made,
        deuxPointsExterieur: s.twos_outside_made,
        troisPoints: s.threes_made,
        lancersFrancs: s.free_throws_made,
        fautes: s.fouls,
        matchsPrecedents: before.map((p) => ({ date: p.match_date, points: p.points, minutes: p.minutes })),
        douleur: pain.get(s.player_id as string)?.text ?? "",
        ficheMemoire: memoryAsText(memories.get(s.player_id as string)),
      };
    });
    try {
      const { data, model } = await askJarvisStructured({
        schema: MatchOut,
        system: MATCH_SYSTEM,
        prompt: `Feuilles de match (JSON) :\n${JSON.stringify(input)}`,
        effort: "low",
        timeoutMs: callTimeout(ctx),
      });
      const byId = new Map(data.replies.map((x) => [x.matchId, x]));
      const rows = chunk.map((s) => {
        const out = byId.get(s.id as string);
        return {
          kind: "match_reply",
          player_id: s.player_id,
          period: s.id,
          channel: "global",
          body: out?.reply.trim().slice(0, MESSAGE_MAX_LENGTH) ?? "",
          reason: out?.reason.trim().slice(0, 300) ?? "",
          status: out?.reply.trim() ? "pending" : "error",
          model,
        };
      });
      await saveDrafts(ctx, rows);
      return rows.filter((x) => x.status === "pending").length;
    } catch (err) {
      if (err instanceof WriteError) throw err;
      await markFailed(
        ctx,
        "match_reply",
        chunk.map((s) => ({ playerId: s.player_id as string, period: s.id as string, reviewId: null })),
        err
      );
      return 0;
    }
  });
}
