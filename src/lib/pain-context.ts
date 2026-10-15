import type { SupabaseClient } from "@supabase/supabase-js";
import { PAIN_PUSH_THRESHOLD, REVIEW_HEALTH_LABELS } from "./constants";
import { painZonesFromNotes, ZONE_LABELS } from "./session-suggestions";

/**
 * Ce que Jarvis doit savoir de la douleur d'un joueur avant d'écrire quoi
 * que ce soit : le dernier check-in douleur (21 jours) et les gênes ou
 * blessures des trois derniers bilans, avec la zone quand la note la nomme.
 *
 * Une seule source pour tous les textes de Jarvis (réponses aux bilans, aux
 * messages, retours de match, visios, rapports, debrief du lundi) : un joueur
 * qui a mal ne reçoit jamais un « on pousse plus fort » d'un brouillon qui
 * l'ignorait.
 */
export interface PainContext {
  /** phrase lisible par le modèle (« Douleur 7/10 au check-in du 12/10… ») */
  text: string;
  /** douleur forte (check-in ≥ seuil) ou blessure déclarée au bilan */
  high: boolean;
}

const WINDOW_DAYS = 21;

const short = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });

export async function getPainContext(
  db: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, PainContext>> {
  const out = new Map<string, PainContext>();
  if (playerIds.length === 0) return out;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [{ data: checkins }, { data: reviews }] = await Promise.all([
    db
      .from("checkins")
      .select("player_id, score, created_at")
      .eq("question", "pain")
      .in("player_id", playerIds)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }),
    db
      .from("weekly_reviews")
      .select("player_id, week_start, health_status, health_note")
      .in("player_id", playerIds)
      .in("health_status", ["gene", "blessure"])
      .gte("week_start", since.toISOString().slice(0, 10))
      .order("week_start", { ascending: false }),
  ]);

  for (const id of playerIds) {
    const parts: string[] = [];
    let high = false;
    const c = (checkins ?? []).find((x) => x.player_id === id);
    if (c && (c.score as number) > 0) {
      parts.push(`douleur ${c.score}/10 au check-in du ${short(c.created_at as string)}`);
      if ((c.score as number) >= PAIN_PUSH_THRESHOLD) high = true;
    }
    const rs = (reviews ?? []).filter((x) => x.player_id === id).slice(0, 3);
    for (const r of rs) {
      const label = REVIEW_HEALTH_LABELS[r.health_status as keyof typeof REVIEW_HEALTH_LABELS] ?? r.health_status;
      const zones = painZonesFromNotes([r.health_note ?? ""]).map((z) => ZONE_LABELS[z]);
      const note = (r.health_note ?? "").trim().slice(0, 140);
      parts.push(
        `${label.toLowerCase()}${zones.length ? ` (${zones.join(", ")})` : ""} au bilan de la semaine du ${short(
          `${r.week_start}T12:00:00Z`
        )}${note ? ` : « ${note} »` : ""}`
      );
      if (r.health_status === "blessure") high = true;
    }
    out.set(id, {
      text: parts.length ? parts.join(" ; ") : "aucune douleur signalée ces trois dernières semaines",
      high,
    });
  }
  return out;
}

/** La consigne commune à tous les textes de Jarvis quand il y a une douleur. */
export const PAIN_RULE = `Champ « douleur » : s'il signale une douleur, une gêne ou une blessure, ton texte en tient compte en priorité — tu prends des nouvelles (où, depuis quand, est-ce que ça va mieux), tu rappelles qu'on adapte son programme et qu'on ne force pas sur la zone, sans jamais poser de diagnostic ni conseiller de médicament. Tu ne pousses jamais à « en faire plus » un joueur qui a mal. Douleur forte ou blessure : conseille d'en parler à un professionnel de santé si ça persiste.`;
