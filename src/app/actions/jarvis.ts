"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { requireStaffProfile } from "@/lib/auth";
import { getPlayersWithDiscipline } from "@/lib/coach-data";
import { getHomeRows } from "@/lib/staff-overview";
import { isMorningBriefConfigured } from "@/lib/briefs";
import { formatAgoFr, parisNow } from "@/lib/dates";
import { formatPercent } from "@/lib/discipline";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { weekdaysLabel } from "@/lib/weekdays";
import { assignSession, addCoachNote, setPlayerAvailability, setWeekFocus } from "@/app/actions/coach";
import { addPlannedEvent } from "@/app/actions/planning";
import { sendConversationMessage } from "@/app/actions/messages";
import type { EventType } from "@/lib/types";

/**
 * Jarvis, l'assistant du staff : une conversation dans le volet de l'accueil.
 * Il lit l'état du groupe, répond aux questions sur le service et AGIT quand
 * on le lui demande — affecter une séance, poser un créneau au planning,
 * écrire à un joueur, fixer un focus, noter, changer une disponibilité.
 *
 * Chaque outil appelle l'action serveur que le staff utiliserait à la main :
 * mêmes contrôles, même RLS (c'est l'utilisateur connecté qui agit), même
 * journal. Jarvis ne peut rien que le staff ne puisse pas.
 */
const JARVIS_MODEL = "claude-opus-5-5";
const MAX_TURNS = 20;
const MAX_CHARS = 4000;
const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as [EventType, ...EventType[]];

export interface JarvisTurn {
  role: "user" | "assistant";
  content: string;
}

export type JarvisResult =
  | { ok: true; reply: string; actions: string[] }
  | { ok: false; error: string };

const SYSTEM = `Tu es Jarvis, l'assistant du staff de VPF, un centre de performance pour jeunes basketteurs (10-18 ans) en France. Tu parles à un membre du staff (coach ou admin), en français, en le tutoyant, de façon brève et concrète.

Le service : deux offres, Perf (suivi à distance) et Formation (Perf + hygiène de vie + fils privés). Chaque joueur a une semaine type (planning), des séances affectées par pôle (technique = basket, physique, routine) sur des jours précis, un bilan le dimanche soir, des check-ins énergie/douleur, des feuilles de match, et un fil de discussion « Global » lu par le joueur, ses parents et le staff.

Tu as l'état du groupe ci-dessous et des outils pour aller plus loin :
- pour LIRE : get_player_details (planning, séances, bilans, matchs, notes d'un joueur), search_sessions (la bibliothèque de séances) ;
- pour AGIR : assign_session, add_planned_event, send_message, set_week_focus, add_private_note, set_availability.

Règles :
- Tu n'agis que si le staff te le demande clairement. Une question n'est pas une demande d'action.
- Pour affecter une séance, cherche-la d'abord avec search_sessions et choisis celle qui colle (pôle, poste du joueur). Si plusieurs conviennent et que la demande est vague, propose 2-3 choix au lieu d'en imposer une.
- send_message écrit dans le fil Global, lu aussi par les parents : jamais de diagnostic médical ni de reproche humiliant. Tutoiement, prénom, 1 à 3 phrases.
- Après une action, dis en une phrase ce que tu as fait. Si un outil échoue, dis-le tel quel.
- Tu n'inventes rien : si une info n'est pas dans tes données ou tes outils, dis-le.
- Réponses courtes : quelques phrases ou une petite liste.
- Texte brut, sans Markdown : pas d'astérisques, pas de #, des tirets simples pour les listes.`;

export async function askJarvis(
  groupId: string | null,
  history: JarvisTurn[],
  /** conversation ouverte depuis la fiche ou la liste d'un joueur : c'est de lui qu'on parle */
  focusPlayerId: string | null = null
): Promise<JarvisResult> {
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;
  if (!isMorningBriefConfigured()) {
    return { ok: false, error: "Jarvis n'est pas branché : la clé API Anthropic manque." };
  }
  const turns = history
    .filter((t) => (t.role === "user" || t.role === "assistant") && t.content.trim())
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_CHARS) }));
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return { ok: false, error: "Pose ta question." };
  }
  while (turns[0]?.role !== "user") turns.shift();

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // ---- l'état du groupe (sous RLS : ce que ce membre du staff voit)
  const all = await getPlayersWithDiscipline(supabase);
  const players = groupId ? all.filter((p) => p.group_id === groupId) : all;
  const rows = await getHomeRows(supabase, {
    viewerId: user.id,
    isAdmin: guard.role === "admin",
    players,
    weeks: 4,
  });
  const knownIds = new Set(rows.map((r) => r.id));
  const nameOf = new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
  const roster = rows.map((r) => ({
    id: r.id,
    nom: `${r.firstName} ${r.lastName}`,
    offre: r.offer,
    dispo: r.availability,
    discipline: formatPercent(r.discipline),
    tendance: r.trend,
    semaine: `${r.weekDone}/${r.weekPlanned}`,
    bilan: r.review,
    dernierEchange: r.lastExchangeAt ? formatAgoFr(r.lastExchangeAt) : "aucun",
    messageEnAttente: r.unread,
    douleur: r.pain ? `${r.pain.score}/10 ${formatAgoFr(r.pain.at)}` : null,
    programme: r.coverage
      ? { technique: r.coverage.byPole.basket, physique: r.coverage.byPole.physique, routine: r.coverage.byPole.routine }
      : null,
    dernierMatch: r.matches[0] ? `${r.matches[0].points} pts le ${r.matches[0].date}` : null,
    visioDepart: r.kickoffDoneAt ? "faite" : "à faire",
    alertes: r.alerts.map((a) => a.label),
  }));

  const actions: string[] = [];
  const who = (id: string) => nameOf.get(id) ?? "ce joueur";
  const ensure = (id: string) => {
    if (!knownIds.has(id)) throw new Error("Joueur inconnu dans ce groupe.");
  };
  const done = (text: string) => {
    actions.push(text);
    return `OK : ${text}`;
  };

  const tools = [
    betaZodTool({
      name: "get_player_details",
      description:
        "Détails d'un joueur : semaine type, séances affectées par jour, 3 derniers bilans, 5 dernières feuilles de match, focus, 3 dernières notes privées.",
      inputSchema: z.object({ playerId: z.string() }),
      run: async ({ playerId }) => {
        ensure(playerId);
        const [ev, asg, rev, mat, foc, notes, pl] = await Promise.all([
          supabase.from("planned_events").select("event_type, weekday, event_time, duration_minutes, custom_name").eq("player_id", playerId).order("weekday"),
          supabase.from("session_assignments").select("weekday, session:library_sessions(name, pole)").eq("player_id", playerId).is("removed_at", null),
          supabase.from("weekly_reviews").select("week_start, went_well, to_improve, health_status, health_note, coach_reply").eq("player_id", playerId).order("week_start", { ascending: false }).limit(3),
          supabase.from("match_stats").select("match_date, points, minutes, threes_made, free_throws_made").eq("player_id", playerId).order("match_date", { ascending: false }).limit(5),
          supabase.from("coach_focus").select("content").eq("player_id", playerId).maybeSingle(),
          supabase.from("coach_notes").select("content, created_at").eq("player_id", playerId).order("created_at", { ascending: false }).limit(3),
          supabase.from("players").select("position, club, season_goal").eq("id", playerId).maybeSingle(),
        ]);
        return JSON.stringify({
          profil: pl.data,
          semaineType: ev.data,
          seances: asg.data,
          bilans: rev.data,
          matchs: mat.data,
          focus: foc.data?.content ?? null,
          notes: notes.data,
        });
      },
    }),
    betaZodTool({
      name: "search_sessions",
      description:
        "Cherche dans la bibliothèque de séances. pole : basket (technique), physique ou routine. query : mots du nom (facultatif).",
      inputSchema: z.object({
        query: z.string().optional(),
        pole: z.enum(["basket", "physique", "routine"]).optional(),
      }),
      run: async ({ query, pole }) => {
        let q = supabase
          .from("library_sessions")
          .select("id, name, pole, categories, positions, duration_minutes")
          .order("name")
          .limit(40);
        if (pole) q = q.eq("pole", pole);
        if (query?.trim()) q = q.ilike("name", `%${query.trim()}%`);
        const { data, error } = await q;
        if (error) return `Erreur : ${error.message}`;
        return JSON.stringify(data ?? []);
      },
    }),
    betaZodTool({
      name: "assign_session",
      description:
        "Affecte une séance de la bibliothèque à un ou plusieurs joueurs, sur des jours précis (1 = lundi … 7 = dimanche). Le joueur est prévenu par push.",
      inputSchema: z.object({
        sessionId: z.string(),
        sessionName: z.string(),
        playerIds: z.array(z.string()).min(1),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1),
      }),
      run: async ({ sessionId, sessionName, playerIds, weekdays }) => {
        playerIds.forEach(ensure);
        const r = await assignSession(sessionId, playerIds, weekdays);
        if (!r.ok) return `Échec : ${r.error}`;
        return done(`« ${sessionName} » affectée à ${playerIds.map(who).join(", ")} (${weekdaysLabel(weekdays)})`);
      },
    }),
    betaZodTool({
      name: "add_planned_event",
      description: `Ajoute un créneau à la semaine type d'un joueur. event_type parmi : ${EVENT_TYPES.join(", ")}. time au format HH:MM, duration en minutes.`,
      inputSchema: z.object({
        playerId: z.string(),
        eventType: z.enum(EVENT_TYPES),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1),
        time: z.string(),
        durationMinutes: z.number().int().min(5).max(600),
        customName: z.string().optional(),
      }),
      run: async ({ playerId, eventType, weekdays, time, durationMinutes, customName }) => {
        ensure(playerId);
        const r = await addPlannedEvent(playerId, {
          event_type: eventType,
          weekday: weekdays,
          event_time: time,
          duration_minutes: durationMinutes,
          custom_name: customName,
        });
        if (!r.ok) return `Échec : ${r.error}`;
        return done(`${EVENT_TYPE_LABELS[eventType]} ajouté au planning de ${who(playerId)} (${weekdaysLabel(weekdays)} à ${time})`);
      },
    }),
    betaZodTool({
      name: "send_message",
      description: "Envoie un message au joueur dans son fil Global (lu aussi par les parents et le staff).",
      inputSchema: z.object({ playerId: z.string(), body: z.string().min(1).max(1500) }),
      run: async ({ playerId, body }) => {
        ensure(playerId);
        const r = await sendConversationMessage(playerId, body, null);
        if (!r.ok) return `Échec : ${r.error}`;
        return done(`message envoyé à ${who(playerId)}`);
      },
    }),
    betaZodTool({
      name: "set_week_focus",
      description: "Fixe le focus de la semaine d'un joueur (200 caractères max), affiché dans son espace.",
      inputSchema: z.object({ playerId: z.string(), content: z.string().max(200) }),
      run: async ({ playerId, content }) => {
        ensure(playerId);
        const r = await setWeekFocus(playerId, content);
        if (!r.ok) return `Échec : ${r.error}`;
        return done(`focus de ${who(playerId)} : « ${content} »`);
      },
    }),
    betaZodTool({
      name: "add_private_note",
      description: "Ajoute une note privée (staff seulement) sur la fiche d'un joueur.",
      inputSchema: z.object({ playerId: z.string(), content: z.string().min(1).max(2000) }),
      run: async ({ playerId, content }) => {
        ensure(playerId);
        const r = await addCoachNote(playerId, content);
        if (!r.ok) return `Échec : ${r.error}`;
        return done(`note privée ajoutée sur la fiche de ${who(playerId)}`);
      },
    }),
    betaZodTool({
      name: "set_availability",
      description: "Change la disponibilité d'un joueur : available, injured (blessé) ou vacation (vacances).",
      inputSchema: z.object({
        playerId: z.string(),
        availability: z.enum(["available", "injured", "vacation"]),
      }),
      run: async ({ playerId, availability }) => {
        ensure(playerId);
        const r = await setPlayerAvailability(playerId, availability);
        if (!r.ok) return `Échec : ${r.error}`;
        return done(`${who(playerId)} passé en « ${availability} »`);
      },
    }),
  ];

  try {
    const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
    const final = await client.beta.messages.toolRunner({
      model: JARVIS_MODEL,
      max_tokens: 4000,
      max_iterations: 8,
      output_config: { effort: "medium" },
      system: `${SYSTEM}\n\nAujourd'hui : ${parisNow().date} (heure de Paris).${
        focusPlayerId && knownIds.has(focusPlayerId)
          ? `\nLa conversation porte sur ${who(focusPlayerId)} (id ${focusPlayerId}) : sauf mention contraire, « il », « elle » ou « le joueur » désigne ce joueur. Commence par get_player_details si la question demande du détail.`
          : ""
      } Joueurs du groupe :\n${JSON.stringify(roster)}`,
      tools,
      messages: turns,
    });
    if (final.stop_reason === "refusal") {
      return { ok: false, error: "Jarvis n'a pas pu répondre à cette demande." };
    }
    const reply = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { ok: true, reply: reply || (actions.length ? "C'est fait." : "…"), actions };
  } catch (err) {
    console.error("[jarvis] échec", err instanceof Error ? err.message : err);
    return {
      ok: false,
      error: actions.length
        ? `Jarvis a été interrompu après : ${actions.join(" ; ")}.`
        : "Jarvis n'a pas pu répondre, réessaie.",
    };
  }
}
