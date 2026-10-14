"use client";

import { useEffect, useRef } from "react";

/**
 * Les visuels de Jarvis : la mascotte VPF (casque bleu marine, lignes orange
 * de ballon, visière noire, yeux bleu glacier), images dans `public/jarvis/`.
 *
 * - `JarvisAvatar` : la tête fixe, partout où Jarvis parle (barre latérale,
 *   volets, discussion). `pose="happy"` = l'illustration souriante de trois
 *   quarts, qui habille le bouton des recommandations. `thinking` la fait
 *   pulser pendant qu'il travaille.
 * - `JarvisLoop` : la tête animée en boucle (vidéo muette de 5 s), pour le
 *   bouton flottant. L'image fixe sert d'affiche et de secours ; elle reste
 *   seule si l'utilisateur demande moins de mouvement.
 */
const SRC = {
  default: "/jarvis/jarvis.webp",
  happy: "/jarvis/jarvis-reco.webp",
} as const;

export function JarvisAvatar({
  size = 32,
  thinking = false,
  pose = "default",
  className = "",
}: {
  size?: number;
  thinking?: boolean;
  pose?: keyof typeof SRC;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- petite image statique, pas besoin de l'optimiseur
    <img
      src={SRC[pose]}
      width={size}
      height={size}
      alt="Jarvis"
      draggable={false}
      className={`shrink-0 select-none rounded-full bg-[#f5efe2] object-cover ${
        thinking ? "jarvis-thinking" : ""
      } ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function JarvisLoop({ size = 58, className = "" }: { size?: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React ne rend pas l'attribut `muted` côté serveur : sans ces deux
    // lignes, le navigateur voit une vidéo sonore et refuse l'autoplay
    video.defaultMuted = true;
    video.muted = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (reduce.matches) {
        video.pause();
        video.currentTime = 0;
      } else {
        // un refus d'autoplay (économie d'énergie) laisse simplement l'affiche
        video.play().catch(() => {});
      }
    };
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, []);

  return (
    <video
      ref={ref}
      width={size}
      height={size}
      poster={SRC.default}
      muted
      autoPlay
      loop
      playsInline
      preload="auto"
      aria-label="Jarvis"
      className={`shrink-0 rounded-full bg-[#f5efe2] object-cover ${className}`}
      style={{ width: size, height: size }}
    >
      <source src="/jarvis/jarvis-loop.webm" type="video/webm" />
      <source src="/jarvis/jarvis-loop.mp4" type="video/mp4" />
    </video>
  );
}
