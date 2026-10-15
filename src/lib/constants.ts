import type { EventType, HabitColor, PlayerAvailability, SessionPole } from "./types";

export const APP_NAME = "VPF — Centre de Performance";

/**
 * Première semaine (lundi) couverte par les rituels bloquants (0043/0044) :
 * bilan du dimanche, feuille de match du week-end. Rien n'est réclamé pour
 * les semaines d'avant — on ne bloque pas sur ce qui n'a pas été rempli
 * avant la règle.
 */
export const GATES_FROM_WEEK = "2026-10-12";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  entrainement_club: "Entraînement club",
  match: "Match",
  training_basket: "Training Basket",
  prep_physique: "Préparation Physique",
  mobilite: "Mobilité",
  revision_scolaire: "Révision scolaire",
  dormir: "Aller dormir",
  petit_dejeuner: "Petit déjeuner",
  collation: "Collation",
  hydratation: "Hydratation",
  autre: "Activité perso",
};

// Types proposés tels quels (l'activité perso « autre » a son propre parcours :
// nom + icône + couleur choisis par le joueur)
export const EVENT_TYPES = (Object.keys(EVENT_TYPE_LABELS) as EventType[]).filter(
  (t) => t !== "autre"
);

/** Libellé d'un événement : le nom perso prime pour une activité « autre ». */
export function eventLabel(e: { event_type: EventType; custom_name?: string | null }): string {
  return e.event_type === "autre" && e.custom_name
    ? e.custom_name
    : EVENT_TYPE_LABELS[e.event_type];
}

// Durée par défaut (minutes) proposée à la création d'un événement, par type.
// Le joueur peut la modifier ; elle sert de base au calcul du temps de travail.
export const DEFAULT_EVENT_MINUTES: Record<EventType, number> = {
  entrainement_club: 90,
  match: 90,
  training_basket: 60,
  prep_physique: 60,
  mobilite: 10,
  revision_scolaire: 60,
  dormir: 480,
  petit_dejeuner: 15,
  collation: 5,
  hydratation: 5,
  autre: 30,
};

// Types comptés comme du « temps de travail consacré à la progression »
// (l'école, le sommeil et les collations n'en font pas partie).
export const WORK_EVENT_TYPES = new Set<EventType>([
  "entrainement_club",
  "match",
  "training_basket",
  "prep_physique",
  "mobilite",
]);

// Choix de durée proposés dans l'éditeur de semaine type (minutes). 2 et 5 min
// couvrent les micro-routines (respiration, étirement ciblé, collation).
export const DURATION_OPTIONS = [2, 5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180];
// Bornes acceptées par l'action serveur — alignées sur la contrainte SQL (0038)
export const EVENT_DURATION_MIN = 1;
export const EVENT_DURATION_MAX = 600;

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
  match: "#0f2a4a",
  training_basket: "#f97316",
  prep_physique: "#22c55e",
  collation: "#22c55e",
  mobilite: "#8b5cf6",
  dormir: "#8b5cf6",
  petit_dejeuner: "#22c55e",
  hydratation: "#22c55e",
  revision_scolaire: "#3b82f6",
  autre: "#41668d",
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
  match: {
    description:
      "Ton match officiel avec le club. Après le coup de sifflet final, l'app te demande ta feuille de match : minutes, tirs, lancers francs.",
    duration: "1 h 30 environ",
    exercises: [
      "Échauffe-toi comme à l'entraînement : tir, appuis, cardio",
      "Un objectif simple pour le match (ex. : 3 rebonds offensifs)",
      "Dès le retour, remplis ta feuille de match dans l'app",
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
  petit_dejeuner: {
    description:
      "Le premier carburant de ta journée : un athlète ne démarre pas le réservoir vide.",
    duration: "15 min, assis, sans écran",
    exercises: [
      "Une source de protéines : œufs, yaourt, fromage blanc",
      "Des glucides qui tiennent : pain complet, flocons d'avoine",
      "Un fruit ou un jus pressé + un grand verre d'eau",
    ],
  },
  hydratation: {
    description:
      "1,5 à 2 L d'eau par jour : la première cause de baisse de régime, c'est la déshydratation.",
    duration: "tout au long de la journée",
    exercises: [
      "Une gourde toujours dans le sac — remplis-la le matin",
      "Bois avant d'avoir soif : un verre à chaque heure",
      "Avant, pendant et après l'entraînement : quelques gorgées régulières",
    ],
  },
  autre: {
    description:
      "Ton activité personnalisée : c'est toi qui l'as ajoutée à ta routine, tiens-la comme le reste.",
    duration: "à ta main",
    exercises: [
      "Fixe-toi un objectif clair avant de commencer",
      "Reste concentré du début à la fin",
      "Pointe-la une fois faite : elle compte dans ta progression",
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

/**
 * Catégories proposées au coach, par pôle. L'ordre fait foi partout : il pilote
 * l'ordre des sections en bibliothèque et le tri des séances côté joueur.
 * Miroir de la contrainte SQL `library_sessions_categories_check` (0027).
 */
export const CATEGORIES: Record<SessionPole, string[]> = {
  basket: ["Début de séance", "Cœur de séance", "Challenge"],
  physique: ["Explosivité", "Endurance", "Renforcement musculaire", "Proprioception"],
  routine: ["Avant-match", "Santé / Prévention des blessures"],
};

/**
 * Une séance de prépa physique peut relever de plusieurs catégories à la fois
 * (un circuit peut être explosivité + renforcement) ; technique et routine
 * restent à une seule catégorie.
 */
export function allowsMultipleCategories(pole: SessionPole): boolean {
  return pole === "physique";
}

/** Catégories d'une séance remises dans l'ordre de référence du pôle. */
export function sortCategories(pole: SessionPole, categories: string[]): string[] {
  const order = CATEGORIES[pole] ?? [];
  return [...categories].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export const POSITIONS = ["Meneur", "Arrière", "Ailier", "Ailier fort", "Pivot"];

export const PLAYER_CATEGORIES = ["U13", "U15", "U17", "U18", "Senior"] as const;

// Discipline faible = moins de 60 % des événements réalisés sur la semaine
export const LOW_DISCIPLINE_THRESHOLD = 0.6;

// Pop-up check-in : tous les 5 jours
export const CHECKIN_INTERVAL_DAYS = 5;

/**
 * Douleur à partir de laquelle le coach référent est prévenu par push, dès la
 * validation du check-in. (Le tableau de bord coach, lui, signale visuellement
 * dès 5/10 sur 7 jours : l'alerte poussée est volontairement plus haute pour ne
 * pas sonner sur une courbature.)
 */
export const PAIN_PUSH_THRESHOLD = 6;

export const VISIBLE_NOTE_MAX_LENGTH = 80;

// Réponse du coach à un bilan hebdomadaire
export const REVIEW_REPLY_MAX_LENGTH = 500;

// Question santé du bilan hebdomadaire (miroir du CHECK de la migration 0032)
export const REVIEW_HEALTH_LABELS = {
  ok: "Tout va bien",
  gene: "Une gêne",
  blessure: "Une blessure",
} as const;
export const REVIEW_HEALTH_NOTE_MAX_LENGTH = 500;

/** Réponses rapides du staff dans la messagerie (bouton éclair de la saisie). */
export const STAFF_QUICK_REPLIES = [
  "Bien reçu 👍",
  "Je regarde ça et je reviens vers toi.",
  "Bravo pour ta semaine, continue comme ça !",
  "Comment va ta douleur aujourd'hui ?",
  "On en parle en visio ? Dis-moi tes dispos.",
  "N'oublie pas de pointer tes séances 💪",
  "Merci pour ton message, on s'en occupe.",
] as const;

// Le bilan hebdo est un rendez-vous fixe : dimanche 18 h, pour toutes les offres
export const REVIEW_DAY = 7;
export const REVIEW_TIME = "18:00";

// Messagerie interne (fil joueur ↔ coach) — bornes alignées sur la migration 0028
export const MESSAGE_MAX_LENGTH = 2000;

/** Profondeur d'historique chargée par le serveur (les plus récents d'abord). */
export const CONVERSATION_HISTORY_LIMIT = 300;

/** Messages affichés d'entrée dans le fil — le reste se déplie à la demande. */
export const CONVERSATION_PAGE_SIZE = 25;

/**
 * Messages balayés pour composer la boîte de réception d'un admin (dernier
 * message de chaque fil privé). Large devant le trafic réel d'un club.
 */
export const INBOX_SCAN_LIMIT = 1000;

/**
 * Messages balayés pour les pastilles de non-lu du staff (onglet Joueurs et
 * liste des joueurs). Les marqueurs de lecture étant monotones par canal, le
 * dernier message d'un fil suffit à trancher : il n'y a donc rien à remonter
 * au-delà, sauf trafic exceptionnel sur un seul fil.
 */
export const STAFF_UNREAD_SCAN_LIMIT = 500;

/**
 * Clé d'un canal de discussion (0034) : le fil coach & parents n'a pas d'admin
 * porteur, les fils privés sont identifiés par l'id de leur admin. Sert de clé
 * d'onglet et de pastille non-lue, côté serveur comme côté client.
 */
/** Le fil Global (0048) : la valeur par défaut de `?canal=`. */
export const STAFF_CHANNEL_KEY = "global";

/** `?canal=` d'un fil (cf. src/lib/channels.ts) ; null = Global. */
export function channelKey(channel: string | null): string {
  return channel ?? STAFF_CHANNEL_KEY;
}

// Pièces jointes des messages (migration 0036) — bucket privé `messages`
export const MESSAGE_BUCKET = "messages";

/** Plafond posé sur le bucket (50 Mo = limite du plan Supabase par fichier). */
export const MESSAGE_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Validité des URL signées servies au client. Généreux devant la durée d'une
 * session de lecture : le fil se recharge (temps réel ou sondage) bien avant
 * l'expiration, et une URL fuitée ne vaut donc que quelques heures.
 */
export const MESSAGE_SIGNED_URL_TTL_SECONDS = 4 * 3600;

/** Durée maximale d'un vocal (secondes) — au-delà, on écrit ou on appelle. */
export const VOICE_MESSAGE_MAX_SECONDS = 300;

// Annonces du club (admins → joueurs)
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 80;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 2000;

// Vidéothèque hygiène de vie — catégories suggérées (la colonne reste libre)
export const HYGIENE_VIDEO_CATEGORIES = [
  "Sommeil",
  "Nutrition",
  "Hydratation",
  "Récupération",
  "Mental",
] as const;

// Disponibilité du joueur (gérée par le coach) : gèle série, rappels et moyennes
export const AVAILABILITY_LABELS: Record<PlayerAvailability, string> = {
  available: "Disponible",
  injured: "Blessé",
  vacation: "Vacances",
};

// Lien d'invitation du serveur Discord de l'équipe (bouton flottant du planning).
// ⚠️ À REMPLACER par ta vraie invitation Discord (ex. https://discord.gg/aBcD1234).
// Vide ("") = bouton masqué — on ne montre jamais un lien cassé aux joueurs.
export const DISCORD_INVITE_URL = "";

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

/**
 * Code couleur des pôles côté staff : physique rouge, technique orange,
 * routine bleu. Liseré à gauche et étiquette d'une séance.
 */
export const POLE_COLORS: Record<"basket" | "physique" | "routine", { hex: string; soft: string; label: string }> = {
  physique: { hex: "#d93636", soft: "#fdeceb", label: "Physique" },
  basket: { hex: "#e8622c", soft: "#fdefe7", label: "Technique" },
  routine: { hex: "#2f6fdb", soft: "#eaf1fd", label: "Routine" },
};
