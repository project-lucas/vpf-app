"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/attachments";

/**
 * Lecteur d'un message vocal. Le lecteur natif du navigateur est trop large et
 * change d'allure d'un appareil à l'autre : on ne garde que le nécessaire —
 * lecture/pause, position déplaçable, temps restant.
 *
 * `duration` vient de la base (mesurée à l'enregistrement) : le lecteur est
 * dessiné complet avant même que le fichier soit chargé. Un webm produit par
 * MediaRecorder n'annonce pas sa durée, on ne peut donc pas la lire du fichier.
 */
export function AudioBubble({
  src,
  duration,
  own,
  variant,
}: {
  src: string;
  duration: number | null;
  own: boolean;
  variant: "editorial" | "coach";
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  // durée réelle une fois le fichier chargé — celle de la base fait office
  // d'estimation en attendant
  const [loaded, setLoaded] = useState<number | null>(null);

  const total = loaded ?? duration ?? 0;
  const ed = variant === "editorial";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    const onEnd = () => {
      setIsPlaying(false);
      setPosition(0);
      audio.currentTime = 0;
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setLoaded(audio.duration);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setPosition(value);
  }

  // sur une bulle sombre (ses propres messages), les contrôles s'inversent
  const buttonStyle = own
    ? ed
      ? "border-paper bg-paper text-ink"
      : "border-white bg-white text-navy-800"
    : ed
      ? "border-ink bg-ink text-paper"
      : "border-navy-800 bg-navy-800 text-white";
  const trackColor = own ? (ed ? "accent-paper" : "accent-white") : "accent-current";
  const metaStyle = own ? "opacity-70" : ed ? "text-meta" : "text-navy-400";

  return (
    <div className="flex w-[210px] max-w-full items-center gap-2.5">
      <audio ref={audioRef} src={src} preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? "Mettre en pause" : "Écouter le message vocal"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-transform active:scale-95 ${buttonStyle}`}
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>

      <span className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={Math.min(position, total || 1)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position dans le message vocal"
          className={`h-1 w-full cursor-pointer appearance-none rounded-full bg-current/25 ${trackColor}`}
        />
        <span className={`mt-1 block text-[10px] tabular-nums ${metaStyle}`}>
          {formatDuration(position)} / {total ? formatDuration(total) : "–:––"}
        </span>
      </span>
    </div>
  );
}
