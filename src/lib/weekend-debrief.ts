import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJarvisStructured } from "./jarvis-model";
import { addDays, currentWeekStart } from "./dates";
import { getPainContext } from "./pain-context";
import { sendPushToUser } from "./push";
import { callTimeout, CONTEXT, WriteError, type Ctx } from "./jarvis-runner";

/**
 * Le debrief du lundi (0049) : ce qu'il faut savoir des joueurs d'un groupe
 * après le week-end — matchs joués (et comment), ceux qui n'ont rien dit,
 * douleurs, bilans, et les gestes de la semaine. Un par groupe et par semaine,
 * écrit par Jarvis le lundi matin, lu par le staff du groupe en tête de
 * l'onglet Jarvis ; le staff reçoit une notification quand il est prêt.
 */

export interface DebriefLine {
  playerId: string | null;
  text: string;
}

export interface WeekendDebrief {
  groupId: string;
  groupName: string;
  /** ordre du groupe (A, B, C…) */
  position: number;
  weekStart: string;
  summary: string;
  matches: DebriefLine[];
  watch: DebriefLine[];
  actions: string[];
  createdAt: string;
}

const DebriefOut = z.object({
  summary: z.string(),
  matches: z.array(z.object({ playerId: z.string(), text: z.string() })),
  watch: z.array(z.object({ playerId: z.string(), text: z.string() })),
  actions: z.array(z.string()),
});

const DEBRIEF_SYSTEM = `${CONTEXT}

C'est lundi matin. Tu écris pour le STAFF d'un groupe le debrief du week-end qui vient de passer : ce qu'il faut savoir de ses joueurs avant d'attaquer la semaine. Lu par le staff seulement.

- summary : 2 à 3 phrases, le bilan d'ensemble (combien ont joué, l'ambiance générale, le fait marquant).
- matches : une ligne par joueur qui a rempli une feuille de match ce week-end — ses chiffres clés et ce qu'ils disent par rapport à ses matchs précédents (« 18 pts, son record de la saison »). 140 signes au plus par ligne.
- watch : les joueurs à surveiller — douleur ou blessure déclarée, bilan de la semaine non rendu, feuille de match ni remplie ni expliquée, semaine très en dessous de son habitude. Une ligne par joueur, la raison en clair. 140 signes au plus.
- actions : 2 à 4 gestes concrets pour le staff cette semaine (« Prendre des nouvelles du genou de Théo », « Féliciter Inès pour son match »).

Pas de jugement sur les joueurs, rien d'inventé : seulement ce que disent les données. Si le week-end est calme, dis-le en peu de mots. Texte brut, sans Markdown. playerId tel quel.`;

/** Le debrief de la semaine en cours pour ces groupes (lecture RLS). */
export async function getWeekendDebriefs(
  supabase: SupabaseClient,
  weekStart: string
): Promise<WeekendDebrief[]> {
  const { data } = await supabase
    .from("weekend_debriefs")
    .select("group_id, week_start, summary, sections, created_at, group:groups(name, position)")
    .eq("week_start", weekStart);
  return (data ?? [])
    .map((d) => {
      const group = Array.isArray(d.group) ? d.group[0] : d.group;
      const sections = (d.sections ?? {}) as Partial<Pick<WeekendDebrief, "matches" | "watch" | "actions">>;
      return {
        groupId: d.group_id as string,
        groupName: (group?.name as string | undefined) ?? "Groupe",
        position: (group?.position as number | undefined) ?? 0,
        weekStart: d.week_start as string,
        summary: d.summary as string,
        matches: sections.matches ?? [],
        watch: sections.watch ?? [],
        actions: sections.actions ?? [],
        createdAt: d.created_at as string,
      };
    })
    .sort((a, b) => a.position - b.position);
}

export async function prepareWeekendDebriefs(ctx: Ctx): Promise<number> {
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);
  const saturday = addDays(weekStart, -2);
  const sunday = addDays(weekStart, -1);

  const [{ data: groups }, { data: done }] = await Promise.all([
    ctx.admin.from("groups").select("id, name, group_staff(profile_id)"),
    ctx.admin.from("weekend_debriefs").select("group_id").eq("week_start", weekStart),
  ]);
  const already = new Set((done ?? []).map((d) => d.group_id as string));
  const todo = (groups ?? []).filter((g) => !already.has(g.id as string));
  let written = 0;

  for (const group of todo) {
    if (ctx.timeLeft() < 25_000) {
      ctx.more = true;
      break;
    }
    const { data: players } = await ctx.admin
      .from("players")
      .select("id, availability, profile:profiles!players_id_fkey(first_name, last_name)")
      .eq("group_id", group.id)
      .eq("status", "active");
    if (!players || players.length === 0) continue;
    const ids = players.map((p) => p.id as string);

    const [{ data: weekendMatches }, { data: history }, { data: answers }, { data: reviews }, { data: summaries }, pain] =
      await Promise.all([
        ctx.admin
          .from("match_stats")
          .select("player_id, match_date, points, minutes, threes_made, free_throws_made, fouls")
          .in("player_id", ids)
          .gte("match_date", saturday)
          .lte("match_date", sunday),
        ctx.admin
          .from("match_stats")
          .select("player_id, match_date, points")
          .in("player_id", ids)
          .lt("match_date", saturday)
          .order("match_date", { ascending: false })
          .limit(ids.length * 4),
        ctx.admin.from("match_weekend_answers").select("player_id, answer").eq("week_start", prevWeekStart).in("player_id", ids),
        ctx.admin
          .from("weekly_reviews")
          .select("player_id, health_status, health_note, went_well, to_improve")
          .eq("week_start", prevWeekStart)
          .in("player_id", ids),
        ctx.admin
          .from("weekly_summaries")
          .select("player_id, planned_count, done_count")
          .eq("week_start", prevWeekStart)
          .in("player_id", ids),
        getPainContext(ctx.admin, ids),
      ]);

    const input = players.map((p) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      const id = p.id as string;
      const review = (reviews ?? []).find((r) => r.player_id === id);
      const week = (summaries ?? []).find((w) => w.player_id === id);
      return {
        playerId: id,
        nom: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
        dispo: p.availability,
        matchsDuWeekend: (weekendMatches ?? []).filter((m) => m.player_id === id),
        pointsMatchsPrecedents: (history ?? []).filter((m) => m.player_id === id).slice(0, 4).map((m) => m.points),
        reponseFeuilleDeMatch: (answers ?? []).find((a) => a.player_id === id)?.answer ?? null,
        bilanDeLaSemaine: review
          ? { sante: review.health_status, noteSante: review.health_note, bienFait: review.went_well, aAmeliorer: review.to_improve }
          : "non rendu",
        pointagesSemaine: week ? `${week.done_count}/${week.planned_count}` : "inconnu",
        douleur: pain.get(id)?.text ?? "",
      };
    });

    try {
      const { data, model } = await askJarvisStructured({
        schema: DebriefOut,
        system: DEBRIEF_SYSTEM,
        prompt: `Groupe « ${group.name} », week-end du ${saturday} au ${sunday}. Joueurs (JSON) :\n${JSON.stringify(input)}`,
        effort: "medium",
        timeoutMs: callTimeout(ctx),
      });
      const known = new Set(ids);
      const line = (l: { playerId: string; text: string }): DebriefLine => ({
        playerId: known.has(l.playerId) ? l.playerId : null,
        text: l.text.trim().slice(0, 220),
      });
      const { data: inserted, error } = await ctx.admin
        .from("weekend_debriefs")
        .upsert(
          {
            group_id: group.id,
            week_start: weekStart,
            summary: data.summary.trim().slice(0, 800),
            sections: {
              matches: data.matches.map(line),
              watch: data.watch.map(line),
              actions: data.actions.map((a) => a.trim().slice(0, 200)).slice(0, 6),
            },
            model,
          },
          { onConflict: "group_id,week_start", ignoreDuplicates: true }
        )
        .select("id");
      if (error) throw new WriteError(`debrief non enregistré : ${error.message}`);
      if (inserted && inserted.length > 0) {
        written += 1;
        // le staff du groupe est prévenu : c'est le rendez-vous du lundi
        const staff = ((group.group_staff ?? []) as { profile_id: string }[]).map((s) => s.profile_id);
        await Promise.all(
          staff.map((id) =>
            sendPushToUser(id, {
              title: `Debrief du week-end · ${group.name}`,
              body: data.summary.trim().slice(0, 140),
              url: "/coach/aujourdhui?section=debrief",
              kind: "reminder",
            })
          )
        );
      }
    } catch (err) {
      if (err instanceof WriteError) throw err;
      ctx.failed += 1;
      console.error("[weekend-debrief] groupe en échec", {
        group: group.id,
        message: err instanceof Error ? err.message : "erreur inconnue",
      });
    }
  }
  return written;
}
