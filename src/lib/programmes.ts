import type { LibrarySession } from "./types";

/**
 * Fiche originale (schémas des exercices) d'une séance programme.
 * Les images vivent dans public/programmes/<poste>-s<n>.png ; le lien est
 * déduit du nom seedé « <Poste> S<n> · <Titre> » — null si la séance n'est
 * pas un programme par poste ou si le nom ne suit pas ce format.
 */
export function programmeSheetUrl(
  session: Pick<LibrarySession, "category" | "name" | "positions">
): string | null {
  if (session.category !== "Programme") return null;
  const poste = session.positions?.[0];
  const match = session.name.match(/\bS(\d+)\s*·/);
  if (!poste || !match) return null;
  const slug = poste
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[0300-036f]/g, "")
    .replace(/\s+/g, "-");
  return `/programmes/${slug}-s${match[1]}.png`;
}
