import { createAdminClient } from "./supabase/admin";

/**
 * La mécanique commune aux chantiers de Jarvis (`jarvis-work.ts`,
 * `jarvis-replies.ts`, `weekend-debrief.ts`) : lots en vagues parallèles
 * bornées par le temps, écriture des brouillons, échecs marqués pour ne pas
 * être retentés en boucle, et les consignes partagées par tous les prompts.
 */

export const CONCURRENCY = 5;
/** On ne lance une vague d'appels que s'il reste au moins ce temps. */
const MIN_WAVE_MS = 30_000;
const CALL_TIMEOUT_MS = 50_000;
/** Un lot en échec est retenté au bout de ce délai (jamais en boucle). */
export const RETRY_AFTER_MS = 6 * 3_600_000;

export type DraftKind = "review_reply" | "visio" | "parent_report" | "message_reply" | "match_reply";

export type Ctx = {
  admin: ReturnType<typeof createAdminClient>;
  timeLeft: () => number;
  failed: number;
  more: boolean;
};

export class WriteError extends Error {}

export const TONE = `Ton : celui d'un coach qui connaît le joueur. Tutoiement, son prénom, chaleureux, concret, en français. Jamais de diagnostic médical, jamais de reproche humiliant, jamais d'information qu'on ne t'a pas donnée. Texte brut : pas de Markdown, pas d'astérisques, emojis avec parcimonie (un au plus).`;

export const CONTEXT = `Tu es Jarvis, l'assistant du staff de VPF, un centre de performance pour jeunes basketteurs (10-18 ans) en France. Chaque joueur a une semaine type, des séances par pôle (technique, physique, routine), un bilan le dimanche soir auquel le coach répond, des check-ins énergie / douleur, des feuilles de match et un fil « Global » lu par le joueur, ses parents et le staff. Deux offres : Perf et Formation (Perf + hygiène de vie).`;

export const PRIVATE_RULE = `La fiche mémoire est un document INTERNE au staff : sers-t'en pour le ton et la justesse, mais n'en reprends jamais un élément privé (famille, scolarité, notes, santé détaillée, ce que le staff pense du joueur) dans un texte que liront le joueur ou ses parents.`;

/** Traite des lots en vagues parallèles tant que le temps le permet. */
export async function runChunks<T>(
  ctx: Ctx,
  items: T[],
  size: number,
  work: (chunk: T[]) => Promise<number>
): Promise<number> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  let done = 0;
  while (chunks.length > 0) {
    if (ctx.timeLeft() < MIN_WAVE_MS) {
      ctx.more = true;
      break;
    }
    const wave = chunks.splice(0, CONCURRENCY);
    const counts = await Promise.all(wave.map((c) => work(c)));
    done += counts.reduce((s, n) => s + n, 0);
  }
  return done;
}

export const callTimeout = (ctx: Ctx) => Math.max(10_000, Math.min(CALL_TIMEOUT_MS, ctx.timeLeft() - 3_000));

/**
 * Enregistre des brouillons. Une écriture refusée arrête le passage : sans
 * ça, le modèle serait rappelé à chaque passage pour rien (et payé).
 */
export async function saveDrafts(ctx: Ctx, rows: Record<string, unknown>[]): Promise<void> {
  const { error } = await ctx.admin
    .from("jarvis_drafts")
    .upsert(rows, { onConflict: "kind,player_id,period", ignoreDuplicates: true });
  if (error) throw new WriteError(`brouillons non enregistrés : ${error.message}`);
}

/** Les lots en échec depuis plus de 6 h redeviennent à faire. */
export async function releaseOldErrors(ctx: Ctx, kind: DraftKind): Promise<void> {
  await ctx.admin
    .from("jarvis_drafts")
    .delete()
    .eq("kind", kind)
    .eq("status", "error")
    .lt("created_at", new Date(Date.now() - RETRY_AFTER_MS).toISOString());
}

export async function markFailed(
  ctx: Ctx,
  kind: DraftKind,
  items: { playerId: string; period: string; reviewId: string | null; channel?: string }[],
  err: unknown
): Promise<void> {
  ctx.failed += items.length;
  const message = err instanceof Error ? err.message : "erreur inconnue";
  console.error("[jarvis-work] lot en échec", { kind, count: items.length, message });
  // marqué en échec : retenté dans 6 h (releaseOldErrors), pas au passage suivant
  await saveDrafts(
    ctx,
    items.map((i) => ({
      kind,
      player_id: i.playerId,
      review_id: i.reviewId,
      period: i.period,
      channel: i.channel ?? "global",
      body: "",
      reason: `Brouillon impossible : ${message}`.slice(0, 300),
      status: "error",
    }))
  );
}
