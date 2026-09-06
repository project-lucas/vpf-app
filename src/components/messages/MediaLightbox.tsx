"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Visionneuse plein écran d'une photo ou d'une vidéo du fil. Sur un téléphone,
 * une image contenue dans une bulle est illisible — l'agrandir doit se faire
 * sans quitter la conversation.
 *
 * Fermeture au clic sur le fond ou à Échap ; le fond de page est figé pendant
 * l'ouverture pour que le fil ne défile pas derrière.
 */
export function MediaLightbox({
  src,
  kind,
  name,
  onClose,
}: {
  src: string;
  kind: "image" | "video";
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
      >
        <X size={20} />
      </button>

      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL Supabase signée, hors next/image
        <img
          src={src}
          alt={name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      ) : (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg"
        />
      )}
    </div>
  );
}
