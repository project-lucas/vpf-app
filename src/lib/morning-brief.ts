import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { getPlayersWithDiscipline } from "./coach-data";
import { getHomeRows, type HomeRow } from "./staff-overview";
import { getGroupsWithStaff } from "./groups";
import { getRecentJournal, logStaffAction } from "./journal";
import { formatAgoFr, parisNow } from "./dates";
import { formatPercent } from "./discipline";
import { BRIEF_ACTIONS, isMorningBriefConfigured, type BriefRecommendation } from "./briefs";
import { OFFER_LABELS } from "./offers";
import { getPlayerMemories, memoryAsText } from "./player-memory";
import { AVAILABILITY_LABELS, REVIEW_HEALTH_LABELS } from "./constants";
import type { GroupWithStaff } from "./types";

/**
 * Le passage de Claude du matin (couche 2). Pour chaque groupe : l'état des
 * joueurs (la même matière que la vue tableau de l'accueil), le journal des
 * dernières 24 h, et un appel au modèle qui renvoie un brief structuré —
 * résumé + recommandations, dont des messages prêts à envoyer. Le brief est
 * enregistré (0042) et lu dans le volet « Claude » de l'accueil.
 *
 * Claude PROPOSE ; c'est le staff qui appuie sur Envoyer. Aucune écriture
 * vers un joueur ne part d'ici.
 */
export const MORNING_BRIEF_MODEL = "claude-opus-5-5";
/** La route cron tourne 60 s au plus : le modèle doit répondre avant. */
const CLIENT_TIMEOUT_MS = 50_000;
const MAX_RECOMMENDATIONS = 8;
const MESSAGE_MAX = 600;

const BriefOutput = z.object({
  summary: z.string(),
  recommendations: z.array(
    z.object({
      playerId: z.string().nullable(),
      title: z.string(),
      why: z.string(),
      message: z.string().nullable(),
      action: z.enum(BRIEF_ACTIONS),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
  ),
});

const SYSTEM_PROMPT = `Tu es Jarvis, l'assistant du staff de VPF, un centre de performance pour jeunes basketteurs (10-18 ans) en France. Chaque matin tu lis l'état d'un groupe de joueurs et tu écris le brief du staff : ce qui compte aujourd'hui, et des recommandations concrètes.

Le service :
- Deux offres : « Perf » (suivi à distance, 90 € par mois, visio de départ puis directives semaine après semaine si le joueur fait ce qu'il doit) et « Formation » (la même chose plus l'hygiène de vie et des fils privés avec le staff).
- Chaque joueur a une semaine type (planning), des séances affectées par pôle (technique, physique, routine), un bilan à remplir le dimanche soir (le coach y répond), des check-ins énergie / douleur, et un fil de discussion « Global » lu par le joueur, ses parents et le staff.
- La discipline = séances pointées / prévues sur la semaine passée. Un joueur blessé ou en vacances est gelé : on ne lui reproche rien, on prend des nouvelles.

Ce que tu écris :
- Un résumé de 2 à 4 phrases, en français, prénoms seulement, qui dit ce qui compte aujourd'hui et comment va le groupe. Pas de liste, pas de chiffres inutiles.
- Au plus ${MAX_RECOMMENDATIONS} recommandations, les plus importantes d'abord (priority 1 = maintenant, 2 = cette semaine, 3 = quand tu peux). Une recommandation = un joueur (ou null pour le groupe), un titre court, une raison en une ou deux phrases, une action parmi : "message" (un message au joueur, que tu écris), "open_fiche" (quelque chose à régler dans sa fiche : programme, planning), "assign_session", "visio" (proposer un échange en visio, avec le message qui le propose), "none".
- Un message au joueur : tutoiement, son prénom, 1 à 3 phrases, chaleureux et concret, le ton d'un coach qui connaît le joueur. Il part dans le fil Global, lu aussi par les parents : jamais de diagnostic médical, jamais de reproche humiliant, jamais d'information qu'on ne t'a pas donnée. Pour une douleur, tu demandes où et depuis quand et tu proposes d'adapter.
- Tu ne recommandes pas ce que le staff a déjà fait aujourd'hui ou hier (voir le journal). Tu n'inventes rien : si tu ne sais pas, tu ne dis pas.
- Un joueur blessé / en vacances : seulement prendre des nouvelles ou répondre à son message.
- Un message en attente d'un joueur ou d'un parent passe avant tout le reste : tu proposes la réponse quand tu as de quoi la faire.
- Chaque joueur a une fiche mémoire (ficheMemoire) : sers-t'en pour la continuité et les détails justes. « decrochage » liste des pentes inquiétantes ; les réponses aux bilans, les visios de décrochage et les rapports aux parents sont déjà préparés par ailleurs dans la file « Aujourd'hui » — ne les recopie pas ici.`;

interface RowForModel {
  id: string;
  prenom: string;
  nom: string;
  offre: string;
  dispo: string;
  discipline: string;
  semaine: string;
  bilan: string;
  dernierEchange: string;
  programme: string;
  douleur: string;
  energie: string;
  alertes: string[];
  ancienneteJours: number;
  decrochage: string[];
  ficheMemoire: string;
}

function rowForModel(r: HomeRow, nowIso: string, memory: string): RowForModel {
  const days = Math.floor((new Date(nowIso).getTime() - new Date(r.createdAt).getTime()) / 86_400_000);
  const bilan =
    r.review === "to-reply"
      ? `reçu, SANS réponse du coach${r.reviewHealth ? ` · santé : ${REVIEW_HEALTH_LABELS[r.reviewHealth] ?? r.reviewHealth}` : ""}${r.reviewExcerpt ? ` · « ${r.reviewExcerpt} »` : ""}`
      : r.review === "replied"
        ? `reçu et répondu${r.reviewHealth && r.reviewHealth !== "ok" ? ` · santé : ${REVIEW_HEALTH_LABELS[r.reviewHealth] ?? r.reviewHealth}` : ""}`
        : r.review === "missing"
          ? "manquant la semaine passée"
          : "rien d'attendu (compte récent)";
  const echange = r.lastExchangeAt
    ? `${formatAgoFr(r.lastExchangeAt)}${r.unread ? " · MESSAGE EN ATTENTE" : ""}${
        r.lastMessagePreview ? ` · dernier message : « ${r.lastMessagePreview} »` : ""
      }`
    : "aucun échange";
  const c = r.coverage;
  const programme = c
    ? `technique ${c.byPole.basket} · physique ${c.byPole.physique} · routine ${c.byPole.routine}${
        c.hidden > 0 ? ` · ${c.hidden} séance(s) sans jour (invisibles pour le joueur)` : ""
      }`
    : "inconnu";
  return {
    id: r.id,
    prenom: r.firstName,
    nom: r.lastName,
    offre: OFFER_LABELS[r.offer],
    dispo: AVAILABILITY_LABELS[r.availability],
    discipline: formatPercent(r.discipline),
    semaine: `${r.weekDone} pointées / ${r.weekPlanned} prévues`,
    bilan,
    dernierEchange: echange,
    programme,
    douleur: r.pain ? `${r.pain.score}/10 ${formatAgoFr(r.pain.at)}` : "pas de check-in",
    energie: r.energy ? `${r.energy.score}/10 ${formatAgoFr(r.energy.at)}` : "pas de check-in",
    alertes: r.alerts.map((a) => a.label),
    ancienneteJours: days,
    decrochage: r.dropout?.reasons ?? [],
    ficheMemoire: memory,
  };
}

export interface BriefRunResult {
  groupId: string;
  groupName: string;
  status: "written" | "skipped" | "error";
  detail: string;
}

/**
 * Écrit le brief du jour des groupes demandés. Sans `force`, un groupe qui a
 * déjà son brief du jour est sauté (le cron tire deux fois : 5h et 6h UTC).
 */
export async function generateMorningBriefs(options: {
  groupId?: string;
  force?: boolean;
} = {}): Promise<{ ok: boolean; error?: string; results: BriefRunResult[] }> {
  if (!isMorningBriefConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY absente : le passage du matin n'est pas branché.", results: [] };
  }
  const admin = createAdminClient();
  const today = parisNow().date;
  const nowIso = new Date().toISOString();

  const [groups, players, { data: existing }] = await Promise.all([
    getGroupsWithStaff(admin),
    getPlayersWithDiscipline(admin),
    admin.from("staff_briefs").select("group_id").eq("brief_date", today),
  ]);
  const done = new Set((existing ?? []).map((b) => b.group_id as string));
  const targets = groups.filter((g) => !options.groupId || g.id === options.groupId);
  const results: BriefRunResult[] = [];

  for (const group of targets) {
    if (!options.force && done.has(group.id)) {
      results.push({ groupId: group.id, groupName: group.name, status: "skipped", detail: "déjà écrit" });
      continue;
    }
    const members = players.filter((p) => p.group_id === group.id);
    if (members.length === 0) {
      results.push({ groupId: group.id, groupName: group.name, status: "skipped", detail: "aucun joueur" });
      continue;
    }
    try {
      const detail = await writeGroupBrief(group, members, today, nowIso);
      results.push({ groupId: group.id, groupName: group.name, status: "written", detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : "erreur inconnue";
      console.error("[morning-brief] échec", { group: group.name, message });
      results.push({ groupId: group.id, groupName: group.name, status: "error", detail: message });
    }
  }
  return { ok: results.every((r) => r.status !== "error"), results };
}

async function writeGroupBrief(
  group: GroupWithStaff,
  members: Awaited<ReturnType<typeof getPlayersWithDiscipline>>,
  today: string,
  nowIso: string
): Promise<string> {
  const admin = createAdminClient();
  // le « lecteur » pour le non-lu : le premier membre du staff du groupe
  const viewerId = group.staff[0]?.id ?? "";
  const [rows, journal, memories] = await Promise.all([
    getHomeRows(admin, { viewerId, isAdmin: true, players: members }),
    getRecentJournal(admin, 30),
    getPlayerMemories(admin, members.map((m) => m.id)),
  ]);
  const since = Date.now() - 36 * 3_600_000;
  const recentJournal = journal
    .filter((e) => new Date(e.created_at).getTime() >= since && e.action !== "brief_written")
    .map((e) => `${formatAgoFr(e.created_at)} : ${e.actorName} ${e.summary}`);

  const userPrompt = [
    `Date : ${today} (heure de Paris). Groupe : ${group.name}, staff : ${group.staff.map((s) => s.first_name).join(", ") || "—"}.`,
    "",
    "Joueurs du groupe (JSON) :",
    JSON.stringify(rows.map((r) => rowForModel(r, nowIso, memoryAsText(memories.get(r.id)))), null, 0),
    "",
    recentJournal.length > 0
      ? `Ce que le staff (et toi) avez déjà fait ces dernières 36 h :\n- ${recentJournal.join("\n- ")}`
      : "Rien dans le journal du staff ces dernières 36 h.",
    "",
    "Écris le brief du matin pour ce groupe.",
  ].join("\n");

  const client = new Anthropic({ timeout: CLIENT_TIMEOUT_MS, maxRetries: 1 });
  const response = await client.beta.messages.parse({
    model: MORNING_BRIEF_MODEL,
    max_tokens: 8000,
    // un refus du classifieur relance la même demande sur le modèle de repli
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: zodOutputFormat(BriefOutput), effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("le modèle a refusé la demande");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("réponse du modèle illisible");

  const knownIds = new Set(rows.map((r) => r.id));
  const recommendations: BriefRecommendation[] = parsed.recommendations
    .filter((r) => r.playerId === null || knownIds.has(r.playerId))
    .slice(0, MAX_RECOMMENDATIONS)
    .map((r) => ({
      playerId: r.playerId,
      title: r.title.trim().slice(0, 120),
      why: r.why.trim().slice(0, 400),
      message: r.message?.trim() ? r.message.trim().slice(0, MESSAGE_MAX) : null,
      action: r.action,
      priority: r.priority,
    }));

  const { error } = await admin.from("staff_briefs").upsert(
    {
      group_id: group.id,
      brief_date: today,
      summary: parsed.summary.trim().slice(0, 1200),
      recommendations,
      model: response.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    { onConflict: "group_id,brief_date" }
  );
  if (error) throw new Error(`enregistrement impossible : ${error.message}`);

  await logStaffAction({
    actorId: null,
    actorKind: "claude",
    playerId: null,
    action: "brief_written",
    summary: `a écrit le brief du matin du ${group.name} · ${recommendations.length} recommandation${
      recommendations.length > 1 ? "s" : ""
    }`,
  });
  return `${recommendations.length} recommandations · ${response.usage.input_tokens + response.usage.output_tokens} tokens`;
}
