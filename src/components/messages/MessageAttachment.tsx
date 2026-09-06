"use client";

import { useState } from "react";
import { FileText, Play } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/attachments";
import type { AttachmentKind } from "@/lib/types";
import { AudioBubble } from "./AudioBubble";
import { MediaLightbox } from "./MediaLightbox";

/**
 * Pièce jointe d'un message, rendue selon sa nature (0036) : vignette pour une
 * photo, lecteur pour une vidéo ou un vocal, pastille cliquable pour un PDF.
 *
 * `url` est une URL signée temporaire (le bucket est privé) : absente, c'est
 * que la signature a échoué — on le dit plutôt que d'afficher une image cassée.
 */
export function MessageAttachment({
  url,
  kind,
  name,
  size,
  duration,
  own,
  variant,
}: {
  url: string | null;
  kind: AttachmentKind;
  name: string;
  size: number | null;
  duration: number | null;
  own: boolean;
  variant: "editorial" | "coach";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ed = variant === "editorial";
  const metaStyle = own ? "opacity-70" : ed ? "text-meta" : "text-navy-400";

  if (!url) {
    return (
      <p className={`text-[11px] italic ${metaStyle}`}>Pièce jointe indisponible.</p>
    );
  }

  if (kind === "audio") {
    return <AudioBubble src={url} duration={duration} own={own} variant={variant} />;
  }

  if (kind === "image" || kind === "video") {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={kind === "image" ? `Agrandir la photo ${name}` : `Lire la vidéo ${name}`}
          className="relative block max-w-[240px] overflow-hidden rounded-lg"
        >
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL Supabase signée, hors next/image
            <img src={url} alt={name} className="max-h-[260px] w-full object-cover" />
          ) : (
            <>
              {/* preload metadata : la première image sert de vignette sans
                  télécharger la vidéo entière sur un forfait mobile */}
              <video src={url} preload="metadata" muted playsInline className="max-h-[260px] w-full object-cover" />
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center bg-black/25"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-navy-800">
                  <Play size={20} className="ml-0.5" />
                </span>
              </span>
              {duration && (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {formatDuration(duration)}
                </span>
              )}
            </>
          )}
        </button>

        {isOpen && (
          <MediaLightbox src={url} kind={kind} name={name} onClose={() => setIsOpen(false)} />
        )}
      </>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex max-w-[240px] items-center gap-2.5 rounded-lg px-2.5 py-2 transition-opacity hover:opacity-80 ${
        own ? "bg-white/15" : ed ? "bg-ink/5" : "bg-white"
      }`}
    >
      <FileText size={18} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{name}</span>
        {size !== null && (
          <span className={`block text-[10px] ${metaStyle}`}>{formatBytes(size)}</span>
        )}
      </span>
    </a>
  );
}
