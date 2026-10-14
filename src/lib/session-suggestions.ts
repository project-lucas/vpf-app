import { POSITIONS } from "@/lib/constants";
import { SESSION_PROFILES, type BodyZone, type SessionProfile } from "@/lib/session-profiles";
import type { SessionPole } from "@/lib/types";

/**
 * Les séances à proposer à un joueur, pôle par pôle, sans piocher dans le
 * catalogue. Trois entrées :
 *  - son POSTE (Meneur… Pivot) : chaque séance a une note par poste, tirée de
 *    l'analyse de sa vidéo (`session-profiles.ts`) ;
 *  - ses DOULEURS : la zone (dos, genou, cheville, épaule) se lit dans la
 *    note santé de ses derniers bilans ; une séance qui charge la zone est
 *    écartée, une routine qui la soigne remonte en tête ;
 *  - ce qu'il a DÉJÀ : une séance en cours d'affectation n'est pas reproposée.
 * Rien n'est stocké ni affecté ici : la page propose, le coach clique.
 */

export interface SuggestionInput {
  position: string | null;
  /** zones douloureuses récentes (cf. `painZonesFromNotes`) */
  painZones: BodyZone[];
  /** séances déjà affectées (non retirées) */
  assignedSessionIds: Set<string>;
  /** le catalogue visible du coach */
  library: { id: string; name: string; pole: SessionPole; duration_minutes: number }[];
}

export interface SessionSuggestion {
  sessionId: string;
  name: string;
  pole: SessionPole;
  durationMinutes: number;
  /** pourquoi elle est proposée, en une phrase */
  reason: string;
  /** proposée pour une douleur : passe devant le reste */
  forPain: BodyZone | null;
}

export const ZONE_LABELS: Record<BodyZone, string> = {
  dos: "dos",
  genou: "genou",
  cheville: "cheville",
  epaule: "épaule",
};

const ZONE_WORDS: Record<BodyZone, RegExp> = {
  dos: /\b(dos\b|lombaire|lombalgie|reins\b|colonne vert|dorsal)/i,
  genou: /\b(genou|genoux|rotule|rotulien|m[ée]nisque|tendinite.*genou|osgood)/i,
  cheville: /\b(cheville|chevilles|entorse|tendon d.achille|achille|pied|pieds)/i,
  // pas de \b devant « é » : en JS il ne compte pas comme une lettre
  epaule: /(?:^|[^a-zà-ÿ])([ée]paules?|clavicule)/i,
};

/** Les zones citées dans des notes santé libres (« mal à la cheville droite »). */
export function painZonesFromNotes(notes: string[]): BodyZone[] {
  const zones = new Set<BodyZone>();
  for (const note of notes) {
    for (const zone of Object.keys(ZONE_WORDS) as BodyZone[]) {
      if (ZONE_WORDS[zone].test(note)) zones.add(zone);
    }
  }
  return [...zones];
}

/** « meneur », « MENEUR », « Ailier Fort » → la forme de `POSITIONS`. */
export function normalizePosition(position: string | null): string | null {
  if (!position) return null;
  const p = position.trim().toLowerCase();
  return POSITIONS.find((x) => x.toLowerCase() === p) ?? null;
}

const MAX_PER_POLE = 3;

export function suggestSessions(input: SuggestionInput): Record<SessionPole, SessionSuggestion[]> {
  const position = normalizePosition(input.position);
  const pains = input.painZones;
  const out: Record<SessionPole, SessionSuggestion[]> = { basket: [], physique: [], routine: [] };

  const scored = input.library
    .filter((s) => !input.assignedSessionIds.has(s.id))
    .map((s) => {
      const profile: SessionProfile | undefined = SESSION_PROFILES[s.id];
      if (!profile) return null;
      // une séance qui charge une zone douloureuse n'est pas proposée
      if (pains.some((z) => profile.avoidIf.includes(z))) return null;
      const painMatch = pains.find((z) => profile.helpsIf.includes(z)) ?? null;
      const fit = position ? (profile.positions[position] ?? 0) : 2;
      if (!painMatch && fit === 0) return null;
      // une séance DÉDIÉE à la zone (« Santé du dos ») passe devant une séance
      // générale qui la couvre aussi (« Corps complet »)
      const dedicated = painMatch
        ? (ZONE_WORDS[painMatch].test(s.name) ? 30 : 0) + Math.max(0, 8 - 2 * profile.helpsIf.length)
        : 0;
      const score =
        (painMatch ? 100 : 0) + dedicated + fit * 10 + (profile.impact === "faible" && pains.length ? 3 : 0);
      const reason = painMatch
        ? `Douleur au ${ZONE_LABELS[painMatch]} signalée : ${profile.why}`
        : position && fit >= 3
          ? `Cœur du poste de ${position.toLowerCase()} : ${profile.why}`
          : profile.why;
      return { s, score, reason, painMatch };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name, "fr"));

  for (const { s, reason, painMatch } of scored) {
    const list = out[s.pole];
    if (list.length >= MAX_PER_POLE) continue;
    list.push({
      sessionId: s.id,
      name: s.name,
      pole: s.pole,
      durationMinutes: s.duration_minutes,
      reason,
      forPain: painMatch,
    });
  }
  return out;
}

/** Les séances du catalogue à NE PAS donner tant que la douleur dure. */
export function sessionsToAvoid(sessionIds: string[], painZones: BodyZone[]): Map<string, BodyZone> {
  const avoid = new Map<string, BodyZone>();
  for (const id of sessionIds) {
    const zone = painZones.find((z) => SESSION_PROFILES[id]?.avoidIf.includes(z));
    if (zone) avoid.set(id, zone);
  }
  return avoid;
}

/** Note de la séance pour un poste (0 à 3), pour trier le catalogue. */
export function positionFit(sessionId: string, position: string | null): number {
  const p = normalizePosition(position);
  if (!p) return 0;
  return SESSION_PROFILES[sessionId]?.positions[p] ?? 0;
}
