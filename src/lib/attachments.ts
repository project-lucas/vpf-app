import { MESSAGE_ATTACHMENT_MAX_BYTES } from "./constants";
import type { AttachmentKind } from "./types";

/**
 * Pièces jointes de la messagerie (migration 0036) — règles partagées entre le
 * dépôt (client) et l'affichage (serveur et client) : nature du fichier, libellé
 * de repli, formats acceptés.
 *
 * La liste des types MIME est la même que celle posée sur le bucket : ce qui
 * est refusé ici l'aurait été à l'upload, mais avec un message d'erreur
 * illisible plutôt qu'une phrase en français.
 */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/aac",
  "audio/x-m4a",
];
const FILE_TYPES = ["application/pdf"];

export const ACCEPTED_MIME_TYPES = [
  ...IMAGE_TYPES,
  ...VIDEO_TYPES,
  ...AUDIO_TYPES,
  ...FILE_TYPES,
];

/** Valeur de l'attribut `accept` du sélecteur de fichier. */
export const ATTACHMENT_ACCEPT = ACCEPTED_MIME_TYPES.join(",");

/**
 * Type MIME sans ses paramètres : MediaRecorder rend `audio/webm;codecs=opus`,
 * que le bucket refuserait tel quel.
 */
export function baseMimeType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/** Nature d'un fichier, ou null s'il n'est pas accepté dans un message. */
export function attachmentKindOf(type: string): AttachmentKind | null {
  const mime = baseMimeType(type);
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (VIDEO_TYPES.includes(mime)) return "video";
  if (AUDIO_TYPES.includes(mime)) return "audio";
  if (FILE_TYPES.includes(mime)) return "file";
  return null;
}

/** Extension de fichier tirée du type MIME (le nom d'origine peut mentir). */
export function extensionOf(type: string): string {
  const mime = baseMimeType(type);
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/aac": "aac",
    "application/pdf": "pdf",
  };
  return known[mime] ?? "bin";
}

/** Refus lisible d'un fichier, ou null s'il passe. */
export function rejectAttachment(file: { type: string; size: number }): string | null {
  if (!attachmentKindOf(file.type)) {
    return "Format non accepté (photo, vidéo, audio ou PDF).";
  }
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    return `Fichier trop lourd (${Math.round(MESSAGE_ATTACHMENT_MAX_BYTES / 1024 / 1024)} Mo max).`;
  }
  if (file.size === 0) return "Fichier vide.";
  return null;
}

/** Étiquette d'un message sans texte — notifications, aperçus de liste. */
export const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  image: "📷 Photo",
  video: "🎬 Vidéo",
  audio: "🎤 Message vocal",
  file: "📎 Fichier",
};

/**
 * Aperçu d'un message dans une liste (boîte de réception, notification) : le
 * texte s'il y en a, sinon la nature de la pièce jointe.
 */
export function messagePreview(
  message: { body: string; attachment_kind: AttachmentKind | null },
  max = 120
): string {
  const text = message.body.trim();
  const label = message.attachment_kind ? ATTACHMENT_LABELS[message.attachment_kind] : "";
  const preview = text ? (label ? `${label} · ${text}` : text) : label;
  return preview.length > max ? `${preview.slice(0, max - 1)}…` : preview;
}

/** Durée en `m:ss` — lecteurs vocaux et vidéos. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Poids d'un fichier en français (Ko / Mo). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
