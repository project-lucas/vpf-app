import type { EventType, HabitColor, SessionPole } from "./types";

export const APP_NAME = "VPF — Centre de Performance";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  entrainement_club: "Entraînement club",
  training_basket: "Training Basket",
  prep_physique: "Préparation Physique",
  mobilite: "Mobilité",
  revision_scolaire: "Révision scolaire",
  dormir: "Aller dormir",
  collation: "Collation",
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

// Durée par défaut (minutes) proposée à la création d'un événement, par type.
// Le joueur peut la modifier ; elle sert de base au calcul du temps de travail.
export const DEFAULT_EVENT_MINUTES: Record<EventType, number> = {
  entrainement_club: 90,
  training_basket: 60,
  prep_physique: 60,
  mobilite: 10,
  revision_scolaire: 60,
  dormir: 480,
  collation: 5,
};

// Types comptés comme du « temps de travail consacré à la progression »
// (l'école, le sommeil et les collations n'en font pas partie).
export const WORK_EVENT_TYPES = new Set<EventType>([
  "entrainement_club",
  "training_basket",
  "prep_physique",
  "mobilite",
]);

// Choix de durée proposés dans l'éditeur de semaine type (minutes)
export const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180];

// Horaires en 24 h, séparés heures / minutes (deux sélecteurs courts plutôt
// qu'une longue liste). Le champ natif <input type="time"> suit la locale du
// navigateur (AM/PM en anglais) — ici on garantit le format français partout.
// Heures 06 → 22, minutes par pas de 15.
export const HOUR_SLOTS: string[] = Array.from({ length: 17 }, (_, i) =>
  String(i + 6).padStart(2, "0")
);
export const MINUTE_SLOTS = ["00", "15", "30", "45"];

/** Durée lisible : « 30 min », « 1 h », « 1 h 30 ». */
export function formatDuration(min: number): string {
  if (!Number.isFinite(min)) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m.toString().padStart(2, "0")}` : `${h} h`;
}

// Début de saison (mois/jour) : le compteur "Jour X de ta saison" repart de la
// dernière occurrence de cette date. 1er septembre = reprise classique.
export const SEASON_START = { month: 9, day: 1 };

// Couleur de la barre de catégorie des cartes d'action du jour
// (basket = orange, physique/nutrition = vert, récupération = violet, école = bleu)
export const EVENT_TYPE_BAR_COLORS: Record<EventType, string> = {
  entrainement_club: "#f97316",
  training_basket: "#f97316",
  prep_physique: "#22c55e",
  collation: "#22c55e",
  mobilite: "#8b5cf6",
  dormir: "#8b5cf6",
  revision_scolaire: "#3b82f6",
};

// Fiche détail de chaque type d'événement (vue détail du planning)
export const EVENT_TYPE_DETAILS: Record<
  EventType,
  { description: string; duration: string; exercises: string[] }
> = {
  entrainement_club: {
    description:
      "Ton entraînement collectif avec le club. Sois acteur : intensité, écoute, communication.",
    duration: "1 h 30 environ",
    exercises: [
      "Arrive 10 min avant pour t'échauffer sérieusement",
      "Fixe-toi un objectif précis (ex. : zéro balle perdue)",
      "Après la séance, note une chose que tu as apprise",
    ],
  },
  training_basket: {
    description:
      "Ta session basket individuelle : c'est ici que ton tir et ton handle progressent vraiment.",
    duration: "45 à 60 min",
    exercises: [
      "Gammes : 50 tirs proches du cercle, 50 à mi-distance",
      "25 tirs à 3 pts en spot-up, compte tes réussites",
      "10 séries de 2 lancers francs en état de fatigue",
    ],
  },
  prep_physique: {
    description: "Renforcement et athlétisme : le corps qui encaisse toute une saison.",
    duration: "30 à 45 min",
    exercises: [
      "Gainage : 3 × 45 s (face, côtés)",
      "Squats et fentes au poids du corps",
      "Pliométrie légère : sauts, skips, appuis",
    ],
  },
  mobilite: {
    description: "Souplesse et récupération : rester disponible et éviter les blessures.",
    duration: "15 à 20 min",
    exercises: [
      "Hanches et chevilles en priorité",
      "Étirements doux, 30 s par position",
      "Respiration lente pour bien récupérer",
    ],
  },
  revision_scolaire: {
    description:
      "Le basket passe aussi par la tête : projet scolaire solide = esprit libre sur le terrain.",
    duration: "45 à 60 min",
    exercises: [
      "Téléphone dans une autre pièce",
      "25 min de focus, 5 min de pause, et on répète",
      "Prépare tes affaires du lendemain avant de fermer",
    ],
  },
  dormir: {
    description: "Le sommeil est ta meilleure récupération : c'est la nuit que tu progresses.",
    duration: "8 à 9 h par nuit",
    exercises: [
      "Écrans coupés 30 min avant le coucher",
      "Chambre fraîche et sombre",
      "Heure de coucher régulière, même le week-end",
    ],
  },
  collation: {
    description: "La recharge intelligente pour tenir tes entraînements à fond.",
    duration: "5 min",
    exercises: [
      "Un fruit + une poignée d'oléagineux",
      "De l'eau, pas de soda",
      "Évite le sucré seul juste avant l'effort",
    ],
  },
};

export const WEEKDAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export const WEEKDAY_LABELS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const POLE_LABELS: Record<SessionPole, string> = {
  basket: "Préparation technique",
  physique: "Préparation physique",
  routine: "Routine",
};

export const CATEGORIES: Record<SessionPole, string[]> = {
  basket: [
    "Programme",
    "Tir",
    "Dribble",
    "Passes",
    "Finition",
    "Footwork",
    "Drive",
    "Jeu au poste",
    "Prise d'écran",
  ],
  physique: ["Mobilité", "Explosivité", "Endurance", "Proprioception", "Kit anti-blessure"],
  routine: ["Avant-match", "Étirements & récupération"],
};

export const POSITIONS = ["Meneur", "Arrière", "Ailier", "Ailier fort", "Pivot"];

export const PLAYER_CATEGORIES = ["U13", "U15", "U17", "U18", "Senior"] as const;

// Discipline faible = moins de 60 % des événements réalisés sur la semaine
export const LOW_DISCIPLINE_THRESHOLD = 0.6;

// Pop-up check-in : tous les 5 jours
export const CHECKIN_INTERVAL_DAYS = 5;

export const VISIBLE_NOTE_MAX_LENGTH = 80;

// Lien d'invitation du serveur Discord de l'équipe (bouton flottant du planning).
// ⚠️ À REMPLACER par ta vraie invitation Discord (ex. https://discord.gg/aBcD1234).
// Laisser vide ("") masque le bouton.
export const DISCORD_INVITE_URL = "https://discord.gg/your-invite";

// Suivi d'habitudes — chaque couleur est déclinée automatiquement en version
// pâle (fond icône, carrés vides) et pleine (carrés remplis, bouton ✓)
export const HABIT_COLORS: Record<HabitColor, { label: string; hex: string }> = {
  gold: { label: "Doré", hex: "#f59e0b" },
  orange: { label: "Orange", hex: "#f97316" },
  yellow: { label: "Jaune", hex: "#eab308" },
  red: { label: "Rouge", hex: "#ef4444" },
  pink: { label: "Rose", hex: "#ec4899" },
  green: { label: "Vert", hex: "#22c55e" },
  blue: { label: "Bleu", hex: "#3b82f6" },
  purple: { label: "Violet", hex: "#8b5cf6" },
  teal: { label: "Turquoise", hex: "#14b8a6" },
};

/** Teinte pâle d'une couleur d'habitude (alpha hex sur fond blanc). */
export function habitPale(hex: string, level: "bg" | "cell" | "future" = "cell"): string {
  const alpha = level === "bg" ? "24" : level === "cell" ? "1f" : "0f";
  return `${hex}${alpha}`;
}

// Icônes lucide disponibles pour les habitudes (stockées par nom en base)
export const HABIT_ICON_NAMES = [
  "dumbbell",
  "footprints",
  "bike",
  "person-standing",
  "activity",
  "zap",
  "flame",
  "target",
  "trophy",
  "timer",
  "droplets",
  "glass-water",
  "apple",
  "salad",
  "moon",
  "bed-double",
  "alarm-clock",
  "book-open",
  "brain",
  "heart",
  "heart-pulse",
  "sun",
] as const;

// Profondeur de chargement des pointages pour la heatmap (couvre toute
// l'année civile en cours, quel que soit le mois actuel)
export const HABIT_HEATMAP_WEEKS = 53;
