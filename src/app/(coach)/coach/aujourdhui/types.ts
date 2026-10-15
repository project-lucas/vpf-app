import type { ReviewHealthStatus } from "@/lib/types";
import type { SessionPole } from "@/lib/types";

/** Ce que la page serveur passe à la file (tout est sérialisable). */
export interface QueuePlayer {
  id: string;
  name: string;
  firstName: string;
  /** prénom du coach référent, null si c'est le lecteur */
  coach: string | null;
}

export interface QueueMessage extends QueuePlayer {
  preview: string | null;
  at: string | null;
  href: string;
}

export interface QueueReview extends QueuePlayer {
  reviewId: string;
  weekLabel: string;
  wentWell: string;
  toImprove: string;
  health: ReviewHealthStatus | null;
  healthNote: string;
  draft: { id: string; body: string; reason: string } | null;
  /** Jarvis n'a pas pu rédiger : on répond à la main */
  draftFailed: boolean;
}

export interface QueueVisio extends QueuePlayer {
  reasons: string[];
  /** proposer la visio */
  body: string;
  /** prendre des nouvelles, sans visio */
  checkinBody: string;
  /** pourquoi Jarvis s'inquiète, null si message type */
  reason: string | null;
  fromJarvis: boolean;
}

export interface QueueProgram extends QueuePlayer {
  items: {
    key: string;
    kind: "add" | "pause" | "replace";
    sessionName: string;
    /** remplacer : les séances mises en pause */
    pausedNames: string[];
    pole: SessionPole | null;
    weekdays: number[];
    sessionId: string | null;
    assignmentIds: string[];
    reason: string;
  }[];
}

export interface QueueReport extends QueuePlayer {
  draftId: string;
  body: string;
  reason: string;
  monthLabel: string;
  parentCount: number;
}

export interface QueueData {
  messages: QueueMessage[];
  reviews: QueueReview[];
  visios: QueueVisio[];
  programs: QueueProgram[];
  reports: QueueReport[];
}
