import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * La fiche mémoire d'un joueur (0046) : cinq phrases que Jarvis remet à jour
 * chaque semaine, pour que n'importe quel coach reprenne le joueur en 30 s.
 * Staff seulement (RLS) — jamais le joueur ni ses parents. Elle nourrit aussi
 * le brief du matin, les réponses aux bilans et les rapports aux parents.
 */
export const MEMORY_SECTIONS = [
  { key: "situation", label: "Où il en est" },
  { key: "works", label: "Ce qui marche" },
  { key: "blocks", label: "Ce qui coince" },
  { key: "promised", label: "Ce qu'on lui a promis" },
  { key: "watch", label: "À surveiller" },
] as const;

export type MemoryKey = (typeof MEMORY_SECTIONS)[number]["key"];
export type MemorySections = Partial<Record<MemoryKey, string>>;

export interface PlayerMemory {
  player_id: string;
  sections: MemorySections;
  updated_at: string;
}

/** Une mémoire est rafraîchie au bout d'une semaine. */
export const MEMORY_REFRESH_DAYS = 7;

export async function getPlayerMemories(
  supabase: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, PlayerMemory>> {
  const out = new Map<string, PlayerMemory>();
  if (playerIds.length === 0) return out;
  const { data } = await supabase
    .from("player_memories")
    .select("player_id, sections, updated_at")
    .in("player_id", playerIds);
  for (const row of data ?? []) {
    const sections = (row.sections ?? {}) as MemorySections;
    if (Object.values(sections).some((v) => v?.trim())) {
      out.set(row.player_id as string, {
        player_id: row.player_id as string,
        sections,
        updated_at: row.updated_at as string,
      });
    }
  }
  return out;
}

/** La mémoire en une ligne de texte, pour un prompt. */
export function memoryAsText(memory: PlayerMemory | undefined): string {
  if (!memory) return "pas encore de fiche mémoire";
  return MEMORY_SECTIONS.map((s) => memory.sections[s.key]?.trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 900);
}
