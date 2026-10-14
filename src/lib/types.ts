export type UserRole = "admin" | "coach" | "player" | "parent";
export type PlayerStatus = "active" | "archived";
/** disponibilité gérée par le coach : blessé/vacances gèle série, rappels et moyennes */
export type PlayerAvailability = "available" | "injured" | "vacation";
/**
 * Offre souscrite, choisie par le coach : « perf » = le socle, « formation » =
 * le socle + les écrans de formation (voir src/lib/offers.ts).
 */
export type PlayerOffer = "perf" | "formation";
export type EventType =
  | "entrainement_club"
  | "training_basket"
  | "prep_physique"
  | "mobilite"
  | "revision_scolaire"
  | "dormir"
  | "petit_dejeuner"
  | "collation"
  | "hydratation"
  /** activité personnalisée du joueur (nom + icône + couleur libres) */
  | "autre";
export type CompletionStatus = "done" | "not_done";
export type SessionPole = "basket" | "physique" | "routine";
export type CheckinQuestion = "energy" | "pain";

export interface Profile {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  whatsapp_number: string;
  notifications_enabled: boolean;
  created_at: string;
}

export interface Player {
  id: string;
  coach_id: string;
  /** groupe de suivi (0040) ; null seulement si tous les groupes ont disparu */
  group_id: string | null;
  position: string;
  club: string;
  birthdate: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  season_goal: string;
  status: PlayerStatus;
  offer: PlayerOffer;
  availability: PlayerAvailability;
  /** date de passage en blessé/vacances, null si disponible */
  availability_since: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface PlayerWithProfile extends Player {
  profile: Pick<Profile, "first_name" | "last_name">;
}

export interface Invitation {
  id: string;
  coach_id: string;
  created_by: string | null;
  player_label: string;
  /** offre appliquée à la fiche joueur créée avec ce lien */
  offer: PlayerOffer;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
}

/** Lien compte parent → joueur (un compte parent = un enfant, 2 parents max). */
export interface ParentLink {
  parent_id: string;
  player_id: string;
  created_at: string;
}

/** Invitation parent à usage unique, créée depuis la fiche du joueur. */
export interface ParentInvitation {
  id: string;
  player_id: string;
  created_by: string | null;
  label: string;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
}

export interface PlannedEvent {
  id: string;
  player_id: string;
  event_type: EventType;
  weekday: number; // 1 = lundi ... 7 = dimanche
  event_time: string; // "HH:MM:SS"
  duration_minutes: number;
  /** activité perso (event_type = "autre") : nom, icône lucide, clé HabitColor */
  custom_name: string;
  custom_icon: string;
  custom_color: string;
  created_at: string;
}

export interface EventCompletion {
  id: string;
  player_id: string;
  planned_event_id: string | null;
  week_start: string; // date du lundi "YYYY-MM-DD"
  event_type: EventType;
  weekday: number;
  event_time: string;
  duration_minutes: number | null;
  status: CompletionStatus;
  comment: string;
  auto_filled: boolean;
  /** snapshot de l'activité perso au moment du pointage */
  custom_name: string;
  custom_icon: string;
  custom_color: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklySummary {
  id: string;
  player_id: string;
  week_start: string;
  planned_count: number;
  done_count: number;
}

export interface MatchStat {
  id: string;
  player_id: string;
  match_date: string;
  /** titulaire au coup d'envoi */
  is_starter: boolean;
  /** temps de jeu, en minutes */
  minutes: number;
  /** points marqués (calculé : 3×3pts + 2×(2pts int+ext) + 1×LF) */
  points: number;
  /** tirs réussis hors lancer franc (calculé : 3pts + 2pts int + 2pts ext) */
  shots_made: number;
  threes_made: number;
  twos_inside_made: number;
  twos_outside_made: number;
  free_throws_made: number;
  fouls: number;
  created_at: string;
}

/** Réponse santé du bilan hebdo — "" sur les bilans d'avant la question. */
export type ReviewHealthStatus = "" | "ok" | "gene" | "blessure";

export interface WeeklyReview {
  id: string;
  player_id: string;
  week_start: string;
  went_well: string;
  to_improve: string;
  health_status: ReviewHealthStatus;
  health_note: string;
  /** réponse du coach (écrite côté serveur uniquement), "" tant qu'il n'a pas répondu */
  coach_reply: string;
  coach_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Checkin {
  id: string;
  player_id: string;
  question: CheckinQuestion;
  score: number;
  created_at: string;
}

export interface SessionExercise {
  order: number;
  title: string;
  durationMinutes: number;
  /** étiquette de mise en avant (« ARME » = l'exercice signature du poste) */
  tag: string | null;
  description: string;
}

export interface SessionChallenge {
  durationMinutes: number | null;
  title: string;
  description: string;
  maxScore: number;
  /** unité du score (« réussites », « dans la cible »…) */
  scoreUnit: string;
  objective: string | null;
}

export interface LibrarySession {
  id: string;
  name: string;
  pole: SessionPole;
  /** au moins une catégorie ; plusieurs seulement en préparation physique */
  categories: string[];
  youtube_url: string;
  /** fiche de training (image du bucket "fiches") ; vide = pas de fiche */
  sheet_url: string;
  duration_minutes: number;
  equipment: string;
  /** postes concernés (Meneur, Pivot…) ; vide = tous les postes */
  positions: string[];
  subtitle: string;
  intro: string;
  /** exercices détaillés (séances programme) ; vide = séance vidéo simple */
  exercises: SessionExercise[];
  challenge: SessionChallenge | null;
  /** créateur : un coach ne gère que ses propres séances, null = admin/seed */
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionAssignment {
  id: string;
  session_id: string;
  player_id: string;
  assigned_by: string | null;
  /**
   * Jour du programme (1 = lundi … 7 = dimanche, comme `planned_events`).
   * null = affectation d'avant 0035 restée à replacer : le joueur ne la voit
   * pas, le coach la retrouve dans « À replacer » sur la fiche.
   */
  weekday: number | null;
  order_index: number;
  removed_at: string | null;
  created_at: string;
}

export interface SessionAssignmentWithSession extends SessionAssignment {
  session: LibrarySession;
  completion: SessionCompletion | null;
}

export interface SessionCompletion {
  id: string;
  assignment_id: string;
  player_id: string;
  status: CompletionStatus;
  comment: string;
  /** score obtenu au challenge noté de la séance (null = pas encore noté) */
  challenge_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerGoal {
  id: string;
  player_id: string;
  /** « 70 % aux lancers francs », « 15 pts de moyenne »… */
  title: string;
  target_value: number;
  /** progression mise à jour par le coach */
  current_value: number;
  /** unité affichée après les valeurs (« % », « pts », vide…) */
  unit: string;
  deadline: string | null;
  achieved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Note sur 5 d'un critère d'hygiène de vie (hydratation, glucides…). */
export type HygieneScore = 1 | 2 | 3 | 4 | 5;

/** Les quatre critères notés sur 5 (le sommeil se saisit en heures). */
export type HygieneCriterion = "hydration" | "carbs" | "proteins" | "vitamins";

export interface HygieneLog {
  id: string;
  player_id: string;
  /** jour noté ; sleep_hours porte sur la nuit qui l'a précédé */
  log_date: string;
  sleep_hours: number;
  hydration: HygieneScore;
  carbs: HygieneScore;
  proteins: HygieneScore;
  vitamins: HygieneScore;
  created_at: string;
  updated_at: string;
}

/** Vidéo éducative d'hygiène de vie (créée par les admins, Bibliothèque). */
export interface HygieneVideo {
  id: string;
  title: string;
  url: string;
  /** catégorie libre — liste suggérée dans HYGIENE_VIDEO_CATEGORIES */
  category: string;
  description: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Activation d'une vidéo hygiène pour un joueur (offre formation). */
export interface HygieneVideoAssignment {
  id: string;
  video_id: string;
  player_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface VisibleNote {
  id: string;
  player_id: string;
  pole: SessionPole;
  content: string;
  updated_at: string;
}

export interface CoachNote {
  id: string;
  player_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export type HabitColor =
  | "gold"
  | "orange"
  | "yellow"
  | "red"
  | "pink"
  | "green"
  | "blue"
  | "purple"
  | "teal";

export interface Habit {
  id: string;
  player_id: string;
  name: string;
  description: string;
  goal: string;
  icon: string; // nom d'icône lucide (ex. "dumbbell")
  color: HabitColor;
  position: number;
  created_at: string;
}

export interface HabitCheck {
  id: string;
  habit_id: string;
  player_id: string;
  check_date: string; // "YYYY-MM-DD"
  created_at: string;
}

export interface HabitWithChecks extends Habit {
  checkDates: string[];
}

/** Ciblage d'une annonce du club : tous les joueurs ou une seule offre. */
export type AnnouncementAudience = "all" | "perf" | "formation";

export interface Announcement {
  id: string;
  author_id: string | null;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  created_at: string;
}

/** Message du fil de discussion d'un joueur (joueur, coach, admin, parent). */
export interface ConversationMessage {
  id: string;
  /** joueur dont c'est le fil */
  player_id: string;
  /**
   * Canal (0034) : null = fil coach & parents, sinon fil privé avec cet admin
   * (offre formation uniquement).
   */
  channel_admin_id: string | null;
  sender_id: string | null;
  body: string;
  created_at: string;
  /** Date de la dernière modification du corps, null si jamais retouché (0036). */
  edited_at: string | null;
  /** Chemin dans le bucket privé `messages` — jamais servi tel quel au client. */
  attachment_path: string | null;
  attachment_kind: AttachmentKind | null;
  attachment_name: string | null;
  attachment_size: number | null;
  /** Durée en secondes (vocaux et vidéos), null sinon. */
  attachment_duration: number | null;
}

/**
 * Nature d'une pièce jointe : décide du rendu dans la bulle (visionneuse,
 * lecteur vidéo, lecteur vocal, ou pastille de fichier).
 */
export type AttachmentKind = "image" | "video" | "audio" | "file";

/**
 * Canal ouvert dans le fil d'un joueur, tel que le voit celui qui regarde :
 * l'étiquette (nom de l'admin) et le drapeau « du nouveau à lire ».
 */
export interface ConversationChannel {
  /** null = fil coach & parents ; sinon fil privé de cet admin */
  adminId: string | null;
  /** prénom de l'admin porteur du fil privé (null pour le fil coach) */
  adminName: string | null;
  hasUnread: boolean;
}

/**
 * Message enrichi pour l'affichage : nom et rôle de l'auteur, et URL signée de
 * la pièce jointe. Le bucket étant privé, `attachment_url` est fabriquée à
 * chaque lecture et périme (MESSAGE_SIGNED_URL_TTL_SECONDS) — ne jamais la
 * stocker, ni la transmettre hors de l'interface.
 */
export interface ConversationMessageWithSender extends ConversationMessage {
  sender_name: string;
  sender_role: UserRole | null;
  attachment_url: string | null;
}

/** Pièce jointe déposée dans le bucket, prête à accompagner un message. */
export interface MessageAttachmentInput {
  path: string;
  kind: AttachmentKind;
  name: string;
  size: number;
  /** Durée en secondes pour un vocal ou une vidéo, null sinon. */
  duration: number | null;
}

/** Groupe de suivi : un staff à plusieurs sur un ensemble de joueurs (0040). */
export interface Group {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

/** Un membre du staff tel que le groupe le présente : un id, un prénom. */
export interface GroupStaffMember {
  id: string;
  first_name: string;
}

/** Un membre du staff du club, pour composer le staff d'un groupe (admin). */
export interface StaffProfile extends GroupStaffMember {
  last_name: string;
  role: UserRole;
}

export interface GroupWithStaff extends Group {
  staff: GroupStaffMember[];
}

/** Prise en charge d'une ligne du brief (« Je prends ») — 0040. */
export interface TaskClaim {
  id: string;
  player_id: string;
  kind: string;
  ref_key: string;
  claimed_by: string;
  claimed_at: string;
}

/** Qui a fait quoi : le staff, et demain le passage automatique du matin. */
export type JournalActorKind = "staff" | "claude" | "system";

export interface StaffJournalEntry {
  id: string;
  actor_id: string | null;
  actor_kind: JournalActorKind;
  player_id: string | null;
  action: string;
  /** la phrase sans son sujet : « a répondu au bilan de Théo » */
  summary: string;
  created_at: string;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
