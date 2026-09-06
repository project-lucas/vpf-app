"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MESSAGE_MAX_SECONDS } from "@/lib/constants";
import { baseMimeType, extensionOf } from "@/lib/attachments";

/**
 * Enregistrement d'un message vocal (MediaRecorder + micro).
 *
 * Deux conteneurs suffisent à couvrir le parc : `audio/webm` (Chrome, Firefox,
 * Android) et `audio/mp4` (Safari, iOS). On interroge le navigateur plutôt que
 * de deviner — un format non supporté rendrait un blob vide.
 *
 * La durée est comptée ici, pas lue dans le fichier : un webm produit par
 * MediaRecorder annonce une durée infinie tant qu'il n'a pas été réencodé.
 */

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export interface VoiceRecorder {
  /** Le micro tourne-t-il ? */
  isRecording: boolean;
  /** Secondes écoulées (mise à jour chaque seconde). */
  seconds: number;
  /** Refus lisible (micro coupé, navigateur trop ancien), sinon null. */
  error: string | null;
  /** Le navigateur sait-il enregistrer ? sinon le bouton micro disparaît. */
  isSupported: boolean;
  start: () => Promise<void>;
  /** Arrête et remet le fichier à `onRecorded`. */
  stop: () => void;
  /** Arrête et jette l'enregistrement. */
  cancel: () => void;
}

export function useVoiceRecorder(
  onRecorded: (file: File, seconds: number) => void
): VoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // un enregistrement annulé s'arrête comme les autres : ce drapeau dit à
  // l'écouteur `stop` de jeter le résultat au lieu de le remonter
  const discardRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  // le support ne se teste qu'au montage côté client (pas de MediaRecorder au
  // rendu serveur), et l'accès au micro exige une origine sécurisée
  useEffect(() => {
    setIsSupported(Boolean(navigator.mediaDevices?.getUserMedia) && pickMimeType() !== null);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const releaseMicrophone = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
  }, []);

  const finish = useCallback(
    (discard: boolean) => {
      discardRef.current = discard;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        clearTimer();
        releaseMicrophone();
        setIsRecording(false);
        return;
      }
      recorder.stop();
    },
    [clearTimer, releaseMicrophone]
  );

  const start = useCallback(async () => {
    setError(null);
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Ton navigateur ne sait pas enregistrer de vocal.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Micro refusé. Autorise-le dans les réglages du navigateur.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardRef.current = false;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const chunks = chunksRef.current;
      chunksRef.current = [];
      releaseMicrophone();
      setIsRecording(false);
      setSeconds(0);

      if (discardRef.current || chunks.length === 0) return;
      const type = baseMimeType(mimeType);
      const blob = new Blob(chunks, { type });
      const file = new File([blob], `vocal-${Date.now()}.${extensionOf(type)}`, { type });
      onRecordedRef.current(file, elapsed);
    };

    recorder.start();
    setIsRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      // au-delà du plafond, on garde ce qui est enregistré plutôt que de le perdre
      if (elapsed >= VOICE_MESSAGE_MAX_SECONDS) finish(false);
    }, 1000);
  }, [clearTimer, finish, releaseMicrophone]);

  // quitter le fil pendant un enregistrement ne doit pas laisser le micro ouvert
  useEffect(
    () => () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        discardRef.current = true;
        recorder.stop();
      }
      recorder?.stream.getTracks().forEach((track) => track.stop());
    },
    [clearTimer]
  );

  return {
    isRecording,
    seconds,
    error,
    isSupported,
    start,
    stop: () => finish(false),
    cancel: () => finish(true),
  };
}
