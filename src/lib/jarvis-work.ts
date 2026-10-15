import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { getPlayersWithDiscipline } from "./coach-data";
import { getHomeRows } from "./staff-overview";
import { addDays, currentWeekStart, parisNow } from "./dates";
import { isMorningBriefConfigured } from "./briefs";
import { logStaffAction } from "./journal";
import { askJarvisStructured } from "./jarvis-model";
import { loadPlayerBundles, type PlayerBundle } from "./jarvis-context";
import { currentMonth, formatMonthFr, REPORT_DAY } from "./jarvis-drafts";
import { getPlayerMemories, memoryAsText, MEMORY_REFRESH_DAYS } from "./player-memory";
import { REVIEW_HEALTH_LABELS, REVIEW_REPLY_MAX_LENGTH } from "./constants";

/**
 * Le passage de Jarvis : il PRÉPARE, le staff valide dans la file
 * « Aujourd'hui ». Quatre chantiers, dans l'ordre d'urgence :
 *  1. une réponse rédigée pour chaque bilan reçu sans réponse ;
 *  2. un message proposant une visio à chaque joueur en décrochage ;
 *  3. la fiche mémoire de chaque joueur, rafraîchie chaque semaine ;
 *  4. le rapport du mois aux parents, la veille de son envoi (le 28).
 *
 * À l'échelle (des centaines de joueurs), le travail se fait par lots : un
 * appel au modèle traite plusieurs joueurs, plusieurs appels partent en
 * parallèle, et chaque passage s'arrête avant la limite de temps de la route —
 * le passage suivant (cron toutes les 10 min) reprend ce qui reste. Tout est
 * idempotent : un brouillon existe une fois par (nature, joueur, période).
 * Un lot en échec est marqué (`error`) pour ne pas être retenté en boucle.
 *
 * Rien ne part vers un joueur ou un parent depuis ce fichier.
 */

const CONCURRENCY = 5;
/** On ne lance une vague d'appels que s'il reste au moins ce temps. */
const MIN_WAVE_MS = 30_000;
const CALL_TIMEOUT_MS = 50_000;
const SIZES = { review: 6, visio: 8, memory: 5, report: 6 } as const;
/** Un compte doit avoir au moins deux semaines dans le mois pour un rapport. */
const REPORT_MIN_DAYS = 14;
/** Les rapports du mois se préparent la veille de leur envoi (le 28), et jusqu'à la fin du mois. */
const REPORT_PREP_DAY = REPORT_DAY - 1;
/** Le repérage du décrochage tourne une fois par matin, avant le brief de 7h. */
const DROPOUT_SCAN_HOUR = 6;

export interface JarvisWorkOptions {
  /** temps total dont dispose le passage */
  budgetMs?: number;
  /** forcer le repérage du décrochage hors de son créneau */
  scanDropout?: boolean;
  /** forcer les rapports du mois en cours avant la veille de l'envoi */
  reports?: boolean;
}

export interface JarvisWorkResult {
  ok: boolean;
  error?: string;
  prepared: { reviews: number; visios: number; memories: number; reports: number };
  failed: number;
  /** il reste du travail : le passage suivant le reprendra */
  more: boolean;
}

const TONE = `Ton : celui d'un coach qui connaît le joueur. Tutoiement, son prénom, chaleureux, concret, en français. Jamais de diagnostic médical, jamais de reproche humiliant, jamais d'information qu'on ne t'a pas donnée. Texte brut : pas de Markdown, pas d'astérisques, emojis avec parcimonie (un au plus).`;

const CONTEXT = `Tu es Jarvis, l'assistant du staff de VPF, un centre de performance pour jeunes basketteurs (10-18 ans) en France. Chaque joueur a une semaine type, des séances par pôle (technique, physique, routine), un bilan le dimanche soir auquel le coach répond, des check-ins énergie / douleur, des feuilles de match et un fil « Global » lu par le joueur, ses parents et le staff. Deux offres : Perf et Formation (Perf + hygiène de vie).`;

type Ctx = {
  admin: ReturnType<typeof createAdminClient>;
  timeLeft: () => number;
  failed: number;
  more: boolean;
};

/** Traite des lots en vagues parallèles tant que le temps le permet. */
async function runChunks<T>(ctx: Ctx, items: T[], size: number, work: (chunk: T[]) => Promise<number>): Promise<number> {
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

const callTimeout = (ctx: Ctx) => Math.max(10_000, Math.min(CALL_TIMEOUT_MS, ctx.timeLeft() - 3_000));

/** Un lot en échec est retenté au bout de ce délai (jamais en boucle). */
const RETRY_AFTER_MS = 6 * 3_600_000;

type DraftKind = "review_reply" | "visio" | "parent_report";

/**
 * Enregistre des brouillons. Une écriture refusée arrête le passage : sans
 * ça, le modèle serait rappelé à chaque passage pour rien (et payé).
 */
async function saveDrafts(ctx: Ctx, rows: Record<string, unknown>[]): Promise<void> {
  const { error } = await ctx.admin
    .from("jarvis_drafts")
    .upsert(rows, { onConflict: "kind,player_id,period", ignoreDuplicates: true });
  if (error) throw new WriteError(`brouillons non enregistrés : ${error.message}`);
}

class WriteError extends Error {}

/** Les lots en échec depuis plus de 6 h redeviennent à faire. */
async function releaseOldErrors(ctx: Ctx, kind: DraftKind): Promise<void> {
  await ctx.admin
    .from("jarvis_drafts")
    .delete()
    .eq("kind", kind)
    .eq("status", "error")
    .lt("created_at", new Date(Date.now() - RETRY_AFTER_MS).toISOString());
}

const PRIVATE_RULE = `La fiche mémoire est un document INTERNE au staff : sers-t'en pour le ton et la justesse, mais n'en reprends jamais un élément privé (famille, scolarité, notes, santé détaillée, ce que le staff pense du joueur) dans un texte que liront le joueur ou ses parents.`;

// ---------------------------------------------------------------------------
// 1. Réponses aux bilans
// ---------------------------------------------------------------------------

const ReviewOut = z.object({
  replies: z.array(z.object({ reviewId: z.string(), reply: z.string(), reason: z.string() })),
});

const REVIEW_SYSTEM = `${CONTEXT}

Tu rédiges la réponse du coach au bilan hebdomadaire de chaque joueur. Le coach la relira, la corrigera si besoin et l'enverra sous son nom : n'écris pas de signature.

Une réponse = 2 à 4 phrases, au plus ${REVIEW_REPLY_MAX_LENGTH} signes. Elle reprend ce que le joueur a écrit (cite ses mots quand c'est utile), salue ce qui a marché, donne UNE piste concrète pour ce qu'il veut améliorer, et prend des nouvelles s'il signale une gêne ou une blessure (où, depuis quand, on adapte). Appuie-toi sur sa fiche mémoire et ses dernières réponses du coach pour la continuité, sans les répéter. Si le bilan est vide ou très court, encourage-le à en dire plus la semaine prochaine.

${TONE}

Pour chaque bilan, renvoie reviewId (tel quel), reply, et reason : en une phrase pour le coach, ce sur quoi ta réponse s'appuie.`;

async function prepareReviewReplies(ctx: Ctx): Promise<number> {
  const weekStart = currentWeekStart();
  const weeks = [weekStart, addDays(weekStart, -7)];
  const { data: reviews } = await ctx.admin
    .from("weekly_reviews")
    .select(
      "id, player_id, week_start, went_well, to_improve, health_status, health_note, coach_reply, player:players!inner(status, position, offer, profile:profiles!players_id_fkey(first_name))"
    )
    .in("week_start", weeks)
    .eq("player.status", "active")
    .or("coach_reply.is.null,coach_reply.eq.");
  if (!reviews || reviews.length === 0) return 0;

  await releaseOldErrors(ctx, "review_reply");
  const { data: existing } = await ctx.admin
    .from("jarvis_drafts")
    .select("review_id")
    .eq("kind", "review_reply")
    .in("period", weeks);
  const drafted = new Set((existing ?? []).map((d) => d.review_id as string));
  const todo = reviews.filter((r) => !drafted.has(r.id));
  if (todo.length === 0) return 0;

  const playerIds = [...new Set(todo.map((r) => r.player_id as string))];
  const [memories, { data: summaries }, { data: pastReplies }] = await Promise.all([
    getPlayerMemories(ctx.admin, playerIds),
    ctx.admin
      .from("weekly_summaries")
      .select("player_id, week_start, planned_count, done_count")
      .in("player_id", playerIds)
      .in("week_start", weeks),
    ctx.admin
      .from("weekly_reviews")
      .select("player_id, week_start, coach_reply")
      .in("player_id", playerIds)
      .not("coach_reply", "is", null)
      .neq("coach_reply", "")
      // borné par la date (pas par un total global qui priverait certains joueurs)
      .gte("week_start", addDays(weekStart, -42))
      .order("week_start", { ascending: false }),
  ]);

  return runChunks(ctx, todo, SIZES.review, async (chunk) => {
    const input = chunk.map((r) => {
      const player = Array.isArray(r.player) ? r.player[0] : r.player;
      const profile = player ? (Array.isArray(player.profile) ? player.profile[0] : player.profile) : null;
      const week = (summaries ?? []).find((s) => s.player_id === r.player_id && s.week_start === r.week_start);
      return {
        reviewId: r.id,
        prenom: profile?.first_name ?? "",
        poste: player?.position || "non renseigné",
        semaine: r.week_start,
        pointages: week ? `${week.done_count} faits / ${week.planned_count} prévus` : "inconnu",
        bienFait: r.went_well ?? "",
        aAmeliorer: r.to_improve ?? "",
        sante: r.health_status
          ? (REVIEW_HEALTH_LABELS[r.health_status as keyof typeof REVIEW_HEALTH_LABELS] ?? r.health_status)
          : "non renseignée",
        noteSante: r.health_note ?? "",
        ficheMemoire: memoryAsText(memories.get(r.player_id as string)),
        dernieresReponsesDuCoach: (pastReplies ?? [])
          .filter((p) => p.player_id === r.player_id)
          .slice(0, 2)
          .map((p) => p.coach_reply),
      };
    });
    try {
      const { data, model } = await askJarvisStructured({
        schema: ReviewOut,
        system: REVIEW_SYSTEM,
        prompt: `Bilans à répondre (JSON) :\n${JSON.stringify(input)}`,
        effort: "low",
        timeoutMs: callTimeout(ctx),
      });
      const byId = new Map(data.replies.map((x) => [x.reviewId, x]));
      const rows = chunk.map((r) => {
        const out = byId.get(r.id);
        return {
          kind: "review_reply",
          player_id: r.player_id,
          review_id: r.id,
          period: r.week_start,
          body: out?.reply.trim().slice(0, REVIEW_REPLY_MAX_LENGTH) ?? "",
          reason: out?.reason.trim().slice(0, 300) ?? "",
          status: out?.reply.trim() ? "pending" : "error",
          model,
        };
      });
      await saveDrafts(ctx, rows);
      return rows.filter((x) => x.status === "pending").length;
    } catch (err) {
      if (err instanceof WriteError) throw err;
      await markFailed(ctx, "review_reply", chunk.map((r) => ({ playerId: r.player_id, period: r.week_start, reviewId: r.id })), err);
      return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Visio pour les joueurs en décrochage
// ---------------------------------------------------------------------------

const VisioOut = z.object({
  messages: z.array(z.object({ playerId: z.string(), message: z.string(), reason: z.string() })),
});

const VISIO_SYSTEM = `${CONTEXT}

Certains joueurs montrent des signes de décrochage (discipline qui baisse plusieurs semaines de suite, énergie qui glisse, bilans qui raccourcissent ou manquent, plus d'échange). Pour chacun, écris le message que le coach enverra dans le fil Global pour PROPOSER UNE VISIO de 20 minutes cette semaine, afin de faire le point ensemble.

Le message : 2 à 3 phrases. Il part d'un intérêt sincère pour le joueur (ce qu'il vit, comment il se sent), propose la visio et demande quel créneau l'arrange. Il ne liste pas les signaux, ne culpabilise pas, ne parle pas de « décrochage » : le fil est lu aussi par les parents.

${PRIVATE_RULE}

${TONE}

Pour chaque joueur, renvoie playerId (tel quel), message, et reason : en une phrase pour le coach, ce qui t'inquiète.`;

async function prepareVisios(ctx: Ctx): Promise<number> {
  const weekStart = currentWeekStart();
  const players = await getPlayersWithDiscipline(ctx.admin);
  if (players.length === 0) return 0;
  // un lecteur réel pour le calcul du non-lu : le premier admin
  const { data: anyAdmin } = await ctx.admin.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  const rows = await getHomeRows(ctx.admin, { viewerId: anyAdmin?.id ?? players[0].coach_id, isAdmin: true, players });
  const atRisk = rows.filter((r) => r.dropout);
  if (atRisk.length === 0) return 0;

  await releaseOldErrors(ctx, "visio");
  const { data: existing } = await ctx.admin
    .from("jarvis_drafts")
    .select("player_id")
    .eq("kind", "visio")
    .eq("period", weekStart);
  const done = new Set((existing ?? []).map((d) => d.player_id as string));
  const todo = atRisk.filter((r) => !done.has(r.id));
  if (todo.length === 0) return 0;
  const memories = await getPlayerMemories(ctx.admin, todo.map((r) => r.id));

  return runChunks(ctx, todo, SIZES.visio, async (chunk) => {
    const input = chunk.map((r) => ({
      playerId: r.id,
      prenom: r.firstName,
      signaux: r.dropout?.reasons ?? [],
      ficheMemoire: memoryAsText(memories.get(r.id)),
      dernierMessage: r.lastMessagePreview ?? "aucun",
    }));
    try {
      const { data, model } = await askJarvisStructured({
        schema: VisioOut,
        system: VISIO_SYSTEM,
        prompt: `Joueurs (JSON) :\n${JSON.stringify(input)}`,
        effort: "low",
        timeoutMs: callTimeout(ctx),
      });
      const byId = new Map(data.messages.map((x) => [x.playerId, x]));
      const out = chunk.map((r) => {
        const m = byId.get(r.id);
        return {
          kind: "visio",
          player_id: r.id,
          period: weekStart,
          body: m?.message.trim().slice(0, 800) ?? "",
          // les signaux restent lisibles pour le staff, même sans la phrase du modèle
          reason: [m?.reason.trim(), (r.dropout?.reasons ?? []).join(" · ")].filter(Boolean).join(" — ").slice(0, 400),
          status: m?.message.trim() ? "pending" : "error",
          model,
        };
      });
      await saveDrafts(ctx, out);
      return out.filter((x) => x.status === "pending").length;
    } catch (err) {
      if (err instanceof WriteError) throw err;
      await markFailed(ctx, "visio", chunk.map((r) => ({ playerId: r.id, period: weekStart, reviewId: null })), err);
      return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Fiches mémoire
// ---------------------------------------------------------------------------

const MemoryOut = z.object({
  memories: z.array(
    z.object({
      playerId: z.string(),
      situation: z.string(),
      works: z.string(),
      blocks: z.string(),
      promised: z.string(),
      watch: z.string(),
    })
  ),
});

const MEMORY_SYSTEM = `${CONTEXT}

Tu tiens la fiche mémoire de chaque joueur : cinq phrases qui permettent à n'importe quel coach de reprendre le joueur en 30 secondes. Elle est lue par le staff seulement.

- situation : où il en est aujourd'hui (assiduité récente, forme, moment de la saison).
- works : ce qui marche chez lui (habitudes tenues, progrès visibles, points forts).
- blocks : ce qui coince (ce qu'il ne fait pas, ce qu'il dit trouver dur, douleurs).
- promised : ce que le staff lui a promis ou s'est engagé à faire (dans les réponses aux bilans, les messages, les notes). « Rien en cours. » s'il n'y a rien.
- watch : le point à surveiller dans les prochaines semaines.

Une phrase par rubrique, 200 signes au plus, prénom du joueur, faits datés quand c'est utile (« depuis trois semaines »). Tu pars de la fiche précédente et tu la mets à jour avec les nouvelles données : garde ce qui reste vrai, corrige ce qui a changé. Tu n'inventes rien : si une rubrique n'a pas de matière, dis-le en quelques mots (« Pas encore assez d'échanges pour le dire. »). Texte brut, sans Markdown.

Renvoie une entrée par joueur avec son playerId tel quel.`;

async function prepareMemories(ctx: Ctx): Promise<number> {
  const { data: players } = await ctx.admin.from("players").select("id").eq("status", "active");
  const ids = (players ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;
  const { data: rows } = await ctx.admin.from("player_memories").select("player_id, updated_at").in("player_id", ids);
  const freshSince = Date.now() - MEMORY_REFRESH_DAYS * 86_400_000;
  const updated = new Map((rows ?? []).map((r) => [r.player_id as string, new Date(r.updated_at as string).getTime()]));
  // jamais faites d'abord, puis les plus anciennes
  const todo = ids
    .filter((id) => (updated.get(id) ?? 0) < freshSince)
    .sort((a, b) => (updated.get(a) ?? 0) - (updated.get(b) ?? 0));
  if (todo.length === 0) return 0;
  const memories = await getPlayerMemories(ctx.admin, todo);

  return runChunks(ctx, todo, SIZES.memory, async (chunk) => {
    const bundles = await loadPlayerBundles(ctx.admin, chunk, memories);
    try {
      const { data, model } = await askJarvisStructured({
        schema: MemoryOut,
        system: MEMORY_SYSTEM,
        prompt: `Date : ${parisNow().date}.\nJoueurs (JSON, « memory » = fiche précédente) :\n${JSON.stringify(bundles.map(bundleForModel))}`,
        effort: "medium",
        timeoutMs: callTimeout(ctx),
      });
      const byId = new Map(data.memories.map((m) => [m.playerId, m]));
      const now = new Date().toISOString();
      const out = chunk.map((id) => {
        const m = byId.get(id);
        const clip = (s: string | undefined) => (s ?? "").trim().slice(0, 240);
        return m
          ? {
              player_id: id,
              sections: {
                situation: clip(m.situation),
                works: clip(m.works),
                blocks: clip(m.blocks),
                promised: clip(m.promised),
                watch: clip(m.watch),
              },
              error: null,
              model,
              updated_at: now,
            }
          : { player_id: id, sections: memories.get(id)?.sections ?? {}, error: "absent de la réponse", model, updated_at: now };
      });
      const { error } = await ctx.admin.from("player_memories").upsert(out, { onConflict: "player_id" });
      if (error) throw new WriteError(`fiches mémoire non enregistrées : ${error.message}`);
      return out.filter((x) => !x.error).length;
    } catch (err) {
      if (err instanceof WriteError) throw err;
      ctx.failed += chunk.length;
      const message = err instanceof Error ? err.message : "erreur inconnue";
      console.error("[jarvis-work] mémoire en échec", { count: chunk.length, message });
      // retentée dans 6 h (date antidatée), la fiche précédente reste en place
      const retryAt = new Date(Date.now() - MEMORY_REFRESH_DAYS * 86_400_000 + RETRY_AFTER_MS).toISOString();
      const { error } = await ctx.admin.from("player_memories").upsert(
        chunk.map((id) => ({
          player_id: id,
          sections: memories.get(id)?.sections ?? {},
          error: message.slice(0, 300),
          updated_at: retryAt,
        })),
        { onConflict: "player_id" }
      );
      if (error) throw new WriteError(`échec non enregistré : ${error.message}`);
      return 0;
    }
  });
}

function bundleForModel(b: PlayerBundle) {
  return {
    playerId: b.id,
    prenom: b.firstName,
    poste: b.position || "non renseigné",
    club: b.club,
    offre: b.offer,
    dispo: b.availability,
    objectifSaison: b.seasonGoal,
    arrive: b.createdAt.slice(0, 10),
    semaines: b.weeks,
    bilans: b.reviews,
    matchs: b.matches,
    objectifs: b.goals,
    notesPrivees: b.notes,
    focus: b.focus,
    filGlobal: b.messages,
    memory: b.memory,
  };
}

// ---------------------------------------------------------------------------
// 4. Rapports du mois aux parents
// ---------------------------------------------------------------------------

const ReportOut = z.object({
  reports: z.array(z.object({ playerId: z.string(), report: z.string(), reason: z.string() })),
});

const REPORT_SYSTEM = `${CONTEXT}

Tu rédiges le compte rendu mensuel adressé aux PARENTS de chaque joueur. Il part dans le fil Global (lu par les parents et le joueur) après relecture du staff : n'écris pas de signature.

Forme : « Bonjour, voici le point du mois de <mois> pour <prénom> : » puis trois courts paragraphes séparés par une ligne vide, chacun commençant par son intitulé :
Assiduité : ce qu'il a fait de son programme (pointages, bilans rendus), sans pourcentage brut si le chiffre est faible — dis-le avec tact.
Progrès : ce qui a avancé (matchs, objectifs, ce qu'il dit lui-même dans ses bilans).
Objectif du mois prochain : UN cap concret et atteignable.
Puis une phrase de fin chaleureuse. 900 signes au plus.

Tu parles du joueur à la troisième personne, avec bienveillance : il lira aussi. Jamais de diagnostic médical (une gêne se dit « une gêne au genou dont on tient compte »), jamais de reproche, jamais d'information absente des données. S'il y a peu de données, fais court et dis-le simplement. Texte brut, sans Markdown.

${PRIVATE_RULE} Le rapport parle du basket : programme, bilans, matchs, objectifs.

Pour chaque joueur, renvoie playerId (tel quel), report, et reason : en une phrase pour le coach, le point qu'il doit vérifier avant d'envoyer.`;

async function prepareReports(ctx: Ctx, period: string): Promise<number> {
  const [y, m] = period.split("-").map(Number);
  const monthStart = `${period}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const cutoff = new Date(new Date(`${monthEnd}T23:59:59Z`).getTime() - REPORT_MIN_DAYS * 86_400_000).toISOString();

  const { data: players } = await ctx.admin
    .from("players")
    .select("id")
    .eq("status", "active")
    .lte("created_at", cutoff);
  const ids = (players ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;
  await releaseOldErrors(ctx, "parent_report");
  const { data: existing } = await ctx.admin
    .from("jarvis_drafts")
    .select("player_id")
    .eq("kind", "parent_report")
    .eq("period", period);
  const done = new Set((existing ?? []).map((d) => d.player_id as string));
  const todo = ids.filter((id) => !done.has(id));
  if (todo.length === 0) return 0;
  const memories = await getPlayerMemories(ctx.admin, todo);
  const monthLabel = formatMonthFr(period);

  return runChunks(ctx, todo, SIZES.report, async (chunk) => {
    const [bundles, { data: weeks }, { data: reviews }, { data: matches }] = await Promise.all([
      loadPlayerBundles(ctx.admin, chunk, memories),
      ctx.admin
        .from("weekly_summaries")
        .select("player_id, week_start, planned_count, done_count")
        .in("player_id", chunk)
        .gte("week_start", monthStart)
        .lte("week_start", monthEnd),
      ctx.admin
        .from("weekly_reviews")
        .select("player_id, week_start, went_well, to_improve, health_status")
        .in("player_id", chunk)
        .gte("week_start", monthStart)
        .lte("week_start", monthEnd),
      ctx.admin
        .from("match_stats")
        .select("player_id, match_date, points, minutes")
        .in("player_id", chunk)
        .gte("match_date", monthStart)
        .lte("match_date", monthEnd),
    ]);
    const input = bundles.map((b) => {
      const w = (weeks ?? []).filter((x) => x.player_id === b.id);
      const planned = w.reduce((s, x) => s + x.planned_count, 0);
      const doneCount = w.reduce((s, x) => s + x.done_count, 0);
      return {
        playerId: b.id,
        prenom: b.firstName,
        mois: monthLabel,
        semaines: w.map((x) => ({ semaine: x.week_start, faits: x.done_count, prevus: x.planned_count })),
        assiduiteMois: planned > 0 ? `${doneCount} faits sur ${planned} prévus` : "rien de prévu ce mois",
        bilansRendus: `${(reviews ?? []).filter((x) => x.player_id === b.id).length} sur ${w.length || 4}`,
        bilans: (reviews ?? [])
          .filter((x) => x.player_id === b.id)
          .map((x) => ({ semaine: x.week_start, bienFait: x.went_well, aAmeliorer: x.to_improve })),
        matchs: (matches ?? []).filter((x) => x.player_id === b.id),
        objectifs: b.goals,
        focus: b.focus,
        ficheMemoire: b.memory,
      };
    });
    try {
      const { data, model } = await askJarvisStructured({
        schema: ReportOut,
        system: REPORT_SYSTEM,
        prompt: `Rapports de ${monthLabel} (JSON) :\n${JSON.stringify(input)}`,
        effort: "low",
        timeoutMs: callTimeout(ctx),
      });
      const byId = new Map(data.reports.map((r) => [r.playerId, r]));
      const out = chunk.map((id) => {
        const r = byId.get(id);
        return {
          kind: "parent_report",
          player_id: id,
          period,
          body: r?.report.trim().slice(0, 1500) ?? "",
          reason: r?.reason.trim().slice(0, 300) ?? "",
          status: r?.report.trim() ? "pending" : "error",
          model,
        };
      });
      await saveDrafts(ctx, out);
      return out.filter((x) => x.status === "pending").length;
    } catch (err) {
      if (err instanceof WriteError) throw err;
      await markFailed(ctx, "parent_report", chunk.map((id) => ({ playerId: id, period, reviewId: null })), err);
      return 0;
    }
  });
}

// ---------------------------------------------------------------------------

async function markFailed(
  ctx: Ctx,
  kind: DraftKind,
  items: { playerId: string; period: string; reviewId: string | null }[],
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
      body: "",
      reason: `Brouillon impossible : ${message}`.slice(0, 300),
      status: "error",
    }))
  );
}

export async function runJarvisWork(options: JarvisWorkOptions = {}): Promise<JarvisWorkResult> {
  const prepared = { reviews: 0, visios: 0, memories: 0, reports: 0 };
  if (!isMorningBriefConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY absente : Jarvis ne peut rien préparer.", prepared, failed: 0, more: false };
  }
  const started = Date.now();
  const budget = options.budgetMs ?? 50_000;
  const ctx: Ctx = {
    admin: createAdminClient(),
    timeLeft: () => budget - (Date.now() - started),
    failed: 0,
    more: false,
  };
  const now = parisNow();

  try {
    prepared.reviews = await prepareReviewReplies(ctx);
    const hour = Math.floor(now.minutesOfDay / 60);
    if (!ctx.more && (options.scanDropout || hour === DROPOUT_SCAN_HOUR)) {
      prepared.visios = await prepareVisios(ctx);
    }
    if (!ctx.more) prepared.memories = await prepareMemories(ctx);
    const dayOfMonth = Number(now.date.slice(8, 10));
    if (!ctx.more && (options.reports || dayOfMonth >= REPORT_PREP_DAY)) {
      prepared.reports = await prepareReports(ctx, currentMonth(now.date));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "erreur inconnue";
    console.error("[jarvis-work] passage interrompu", { message });
    return { ok: false, error: message, prepared, failed: ctx.failed, more: true };
  }

  const parts = [
    prepared.reviews && `${prepared.reviews} réponse${prepared.reviews > 1 ? "s" : ""} de bilan`,
    prepared.visios && `${prepared.visios} proposition${prepared.visios > 1 ? "s" : ""} de visio`,
    prepared.memories && `${prepared.memories} fiche${prepared.memories > 1 ? "s" : ""} mémoire`,
    prepared.reports && `${prepared.reports} rapport${prepared.reports > 1 ? "s" : ""} aux parents`,
  ].filter(Boolean);
  if (parts.length > 0) {
    await logStaffAction({
      actorId: null,
      actorKind: "claude",
      playerId: null,
      action: "jarvis_prepared",
      summary: `a préparé ${parts.join(" · ")}`,
    });
  }
  return { ok: ctx.failed === 0, prepared, failed: ctx.failed, more: ctx.more };
}
