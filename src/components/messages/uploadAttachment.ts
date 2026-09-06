"use client";

import { createClient } from "@/lib/supabase/client";
import { MESSAGE_BUCKET } from "@/lib/constants";
import { attachmentKindOf, baseMimeType, extensionOf, rejectAttachment } from "@/lib/attachments";
import type { MessageAttachmentInput } from "@/lib/types";

/**
 * Dépôt d'une pièce jointe dans le bucket privé `messages` (0036).
 *
 * Le fichier part AVANT le message : au moment d'appuyer sur envoyer, il ne
 * reste qu'une ligne à insérer, donc pas d'attente sur une vidéo de 40 Mo. Le
 * revers est qu'un fichier déposé puis abandonné doit être nettoyé — c'est le
 * rôle de `discardMessageAttachment`.
 *
 * L'upload part directement du navigateur (comme les avatars et les fiches) :
 * une server action plafonnerait à quelques Mo de corps de requête.
 */
export async function uploadMessageAttachment(
  playerId: string,
  file: File,
  duration: number | null = null
): Promise<{ ok: true; attachment: MessageAttachmentInput } | { ok: false; error: string }> {
  const refusal = rejectAttachment(file);
  if (refusal) return { ok: false, error: refusal };

  const kind = attachmentKindOf(file.type);
  if (!kind) return { ok: false, error: "Format non accepté." };

  const payload = kind === "image" ? await downscaleImage(file) : file;
  const contentType = baseMimeType(payload.type);
  // le premier dossier porte l'accès (cf. can_access_message_file) ; l'uuid
  // évite toute collision entre deux dépôts simultanés
  const path = `${playerId}/${crypto.randomUUID()}.${extensionOf(payload.type)}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(MESSAGE_BUCKET)
    .upload(path, payload, { contentType });
  if (error) return { ok: false, error: "Envoi du fichier impossible. Réessaie." };

  const measured = duration ?? (await probeDuration(payload, kind));
  return {
    ok: true,
    attachment: {
      path,
      kind,
      name: file.name || `piece-jointe.${extensionOf(payload.type)}`,
      size: payload.size,
      duration: measured,
    },
  };
}

/** Côté le plus long d'une photo après réduction — large pour du plein écran. */
const IMAGE_MAX_SIDE = 1600;

/** Qualité JPEG de la photo réduite : indiscernable à l'œil, trois fois plus légère. */
const IMAGE_QUALITY = 0.82;

/**
 * Réduction d'une photo avant l'envoi. Un cliché de téléphone pèse 4 à 8 Mo
 * pour 12 Mpx, alors qu'il est regardé dans une bulle de 240 px : c'est du
 * forfait mobile brûlé des deux côtés du fil, et une attente inutile.
 *
 * Le fichier d'origine repart tel quel dès que quelque chose résiste (HEIC que
 * le navigateur ne sait pas décoder, image déjà légère, réduction qui alourdit).
 */
async function downscaleImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (ratio === 1 && file.size < 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Durée d'un média, lue dans ses métadonnées. Sert à dessiner le lecteur avant
 * tout téléchargement ; échec = null, le lecteur se rabat sur l'élément audio.
 */
function probeDuration(file: File, kind: string): Promise<number | null> {
  if (kind !== "audio" && kind !== "video") return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(kind === "audio" ? "audio" : "video");
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      // un webm produit par MediaRecorder annonce souvent une durée infinie
      done(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null);
    };
    media.onerror = () => done(null);
    media.src = url;
  });
}
