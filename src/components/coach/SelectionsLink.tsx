import { Star } from "lucide-react";

// Tableau Google Sheets qui référence les sélections basket (détections,
// sélections départementales…), tenu à jour hors application. Simple lien
// de consultation pour les coachs et admins — aucune donnée n'en dépend.
const SELECTIONS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1VqNyql0PSopoO358uig9uR7sz5crtvHEZZ4piGsL0ok/edit?usp=sharing";

/** Bouton « Sélections » du header coach : ouvre le tableau dans un nouvel onglet. */
export function SelectionsLink() {
  return (
    <a
      href={SELECTIONS_SHEET_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-navy-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-700"
    >
      <Star size={14} className="text-gold" />
      Sélections
    </a>
  );
}
