import type { SupabaseClient } from "@supabase/supabase-js";
import { REVIEW_HEALTH_LABELS } from "./constants";
import { OFFER_LABELS } from "./offers";
import { toOffer } from "./offers";
import { memoryAsText, type PlayerMemory } from "./player-memory";

/**
 * Ce que Jarvis lit d'un joueur pour écrire sa fiche mémoire ou son rapport
 * du mois : profil, semaines, bilans, matchs, objectifs, notes privées, focus
 * et derniers échanges du fil Global. Lu en service_role par le passage de
 * Jarvis (aucun utilisateur connecté) — le résultat ne sort que vers le staff.
 */
export interface PlayerBundle {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  club: string;
  offer: string;
  availability: string;
  seasonGoal: string;
  createdAt: string;
  weeks: { weekStart: string; planned: number; done: number }[];
  reviews: {
    weekStart: string;
    wentWell: string;
    toImprove: string;
    health: string;
    healthNote: string;
    coachReply: string;
  }[];
  matches: { date: string; points: number; minutes: number }[];
  goals: { title: string; current: number; target: number; unit: string; deadline: string | null; achieved: boolean }[];
  notes: { content: string; at: string }[];
  focus: string;
  messages: { from: string; body: string; at: string }[];
  memory: string;
}

const SENDER_LABELS: Record<string, string> = {
  player: "joueur",
  parent: "parent",
  coach: "staff",
  admin: "staff",
};

export async function loadPlayerBundles(
  admin: SupabaseClient,
  playerIds: string[],
  memories: Map<string, PlayerMemory>
): Promise<PlayerBundle[]> {
  return Promise.all(playerIds.map((id) => loadOne(admin, id, memories.get(id))));
}

async function loadOne(admin: SupabaseClient, id: string, memory: PlayerMemory | undefined): Promise<PlayerBundle> {
  const [player, weeks, reviews, matches, goals, notes, focus, messages] = await Promise.all([
    admin
      .from("players")
      .select(
        "position, club, offer, availability, season_goal, created_at, profile:profiles!players_id_fkey(first_name, last_name)"
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("weekly_summaries")
      .select("week_start, planned_count, done_count")
      .eq("player_id", id)
      .order("week_start", { ascending: false })
      .limit(8),
    admin
      .from("weekly_reviews")
      .select("week_start, went_well, to_improve, health_status, health_note, coach_reply")
      .eq("player_id", id)
      .order("week_start", { ascending: false })
      .limit(5),
    admin
      .from("match_stats")
      .select("match_date, points, minutes")
      .eq("player_id", id)
      .order("match_date", { ascending: false })
      .limit(8),
    admin
      .from("player_goals")
      .select("title, current_value, target_value, unit, deadline, achieved_at")
      .eq("player_id", id),
    admin
      .from("coach_notes")
      .select("content, created_at")
      .eq("player_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("coach_focus").select("content").eq("player_id", id).maybeSingle(),
    admin
      .from("conversation_messages")
      .select("body, sender_id, is_system, created_at")
      .eq("player_id", id)
      .eq("channel", "global")
      .order("created_at", { ascending: false })
      .limit(14),
  ]);

  const senderIds = [
    ...new Set((messages.data ?? []).map((m) => m.sender_id as string | null).filter((x): x is string => !!x)),
  ];
  const { data: senders } =
    senderIds.length === 0
      ? { data: [] }
      : await admin.from("profiles").select("id, role").in("id", senderIds);
  const roleOf = new Map((senders ?? []).map((s) => [s.id as string, s.role as string]));

  const p = player.data;
  const profile = p ? (Array.isArray(p.profile) ? p.profile[0] : p.profile) : null;
  return {
    id,
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    position: p?.position ?? "",
    club: p?.club ?? "",
    offer: OFFER_LABELS[toOffer(p?.offer)],
    availability: p?.availability ?? "available",
    seasonGoal: p?.season_goal ?? "",
    createdAt: p?.created_at ?? "",
    weeks: (weeks.data ?? []).map((w) => ({
      weekStart: w.week_start,
      planned: w.planned_count,
      done: w.done_count,
    })),
    reviews: (reviews.data ?? []).map((r) => ({
      weekStart: r.week_start,
      wentWell: (r.went_well ?? "").slice(0, 600),
      toImprove: (r.to_improve ?? "").slice(0, 600),
      health: r.health_status
        ? (REVIEW_HEALTH_LABELS[r.health_status as keyof typeof REVIEW_HEALTH_LABELS] ?? r.health_status)
        : "",
      healthNote: (r.health_note ?? "").slice(0, 300),
      coachReply: (r.coach_reply ?? "").slice(0, 500),
    })),
    matches: (matches.data ?? []).map((m) => ({ date: m.match_date, points: m.points, minutes: m.minutes })),
    goals: (goals.data ?? []).map((g) => ({
      title: g.title,
      current: Number(g.current_value),
      target: Number(g.target_value),
      unit: g.unit ?? "",
      deadline: g.deadline,
      achieved: !!g.achieved_at,
    })),
    notes: (notes.data ?? []).map((n) => ({ content: (n.content ?? "").slice(0, 400), at: n.created_at })),
    focus: focus.data?.content ?? "",
    messages: (messages.data ?? [])
      .map((m) => ({
        from: m.is_system ? "VPF (automatique)" : (SENDER_LABELS[roleOf.get(m.sender_id as string) ?? ""] ?? "?"),
        body: (m.body ?? "").slice(0, 300),
        at: (m.created_at as string).slice(0, 10),
      }))
      .reverse(),
    memory: memoryAsText(memory),
  };
}
