import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Les derniers messages du fil Global d'un joueur, pour avoir l'historique en
 * tête avant d'envoyer une suggestion de Jarvis. Lu sous RLS (le staff voit le
 * fil de ses joueurs) ; l'auteur se déduit sans lire `profiles` : le joueur
 * lui-même, un de ses parents (`parent_links`), « VPF » pour un message
 * automatique, le staff sinon.
 */
export interface ThreadLine {
  from: "player" | "parent" | "staff" | "system";
  body: string;
  at: string;
}

const PER_PLAYER = 3;

export async function getRecentThreadLines(
  supabase: SupabaseClient,
  playerIds: string[]
): Promise<Record<string, ThreadLine[]>> {
  const out: Record<string, ThreadLine[]> = {};
  if (playerIds.length === 0) return out;
  const [{ data: links }, ...threads] = await Promise.all([
    supabase.from("parent_links").select("player_id, parent_id").in("player_id", playerIds),
    ...playerIds.map((id) =>
      supabase
        .from("conversation_messages")
        .select("player_id, sender_id, body, is_system, attachment_kind, created_at")
        .eq("player_id", id)
        .eq("channel", "global")
        .order("created_at", { ascending: false })
        .limit(PER_PLAYER)
    ),
  ]);
  const parents = new Set((links ?? []).map((l) => `${l.player_id}|${l.parent_id}`));
  playerIds.forEach((id, i) => {
    out[id] = (threads[i].data ?? [])
      .map((m) => ({
        from: m.is_system
          ? ("system" as const)
          : m.sender_id === id
            ? ("player" as const)
            : parents.has(`${id}|${m.sender_id}`)
              ? ("parent" as const)
              : ("staff" as const),
        body: (m.body as string)?.trim() || (m.attachment_kind ? "(pièce jointe)" : ""),
        at: m.created_at as string,
      }))
      .reverse();
  });
  return out;
}
