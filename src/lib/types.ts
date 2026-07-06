export type UserRole = "admin" | "coach" | "player";
export type PlayerStatus = "active" | "archived";
export type EventType =
  | "entrainement_club"
  | "training_basket"
  | "prep_physique"
  | "mobilite"
  | "revision_scolaire"
  | "dormir"
  | "collation";
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
  position: string;
  club: string;
  birthdate: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  season_goal: string;
  status: PlayerStatus;
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
  points: number;
  minutes: number;
  rebounds: number;
  steals: number;
  // stats de tir, absentes des matchs saisis avant leur introduction
  shots_attempted: number | null;
  shots_made: number | null;
  threes_attempted: number | null;
  threes_made: number | null;
  created_at: string;
}

export interface WeeklyReview {
  id: string;
  player_id: string;
  week_start: string;
  went_well: string;
  to_improve: string;
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
  category: string;
  youtube_url: string;
  duration_minutes: number;
  equipment: string;
  /** postes concernés (Meneur, Pivot…) ; vide = tous les postes */
  positions: string[];
  subtitle: string;
  intro: string;
  /** exercices détaillés (séances programme) ; vide = séance vidéo simple */
  exercises: SessionExercise[];
  challenge: SessionChallenge | null;
  created_at: string;
  updated_at: string;
}

export interface SessionAssignment {
  id: string;
  session_id: string;
  player_id: string;
  assigned_by: string | null;
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

export type ActionResult = { ok: true } | { ok: false; error: string };
