"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, Paperclip, SendHorizontal, Trash2, X } from "lucide-react";
import { ATTACHMENT_ACCEPT, formatBytes, formatDuration } from "@/lib/attachments";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import type { MessageAttachmentInput } from "@/lib/types";
import { uploadMessageAttachment } from "./uploadAttachment";
import { useVoiceRecorder } from "./useVoiceRecorder";

/** Hauteur maximale de la zone de saisie avant qu'elle défile (≈ 6 lignes). */
const TEXTAREA_MAX_PX = 140;

/** Reste à taper affiché à partir de ce seuil — inutile de compter avant. */
const COUNTER_THRESHOLD = 200;

/**
 * Zone de rédaction d'un message : texte multi-lignes, pièce jointe et vocal.
 *
 * Trois choix qui tranchent avec la version précédente :
 *
 *  * **Le retour à la ligne existe partout.** Entrée n'envoyait le message que
 *    pour laisser Maj+Entrée sauter une ligne — or un téléphone n'a pas de
 *    touche Maj. Au doigt, Entrée saute donc une ligne et l'envoi se fait au
 *    bouton ; à la souris, Entrée envoie et Maj+Entrée saute la ligne.
 *  * **La pièce jointe part avant le message.** Appuyer sur envoyer n'attend
 *    jamais le transfert d'une vidéo ; le fichier est déjà là, il ne reste
 *    qu'une ligne à écrire.
 *  * **Un vocal s'écoute avant d'être envoyé.** L'enregistrement devient une
 *    pièce jointe en attente comme une autre, qu'on peut jeter.
 */
export function MessageComposer({
  playerId,
  variant,
  disabled,
  onSend,
  onDiscardAttachment,
}: {
  playerId: string;
  variant: "editorial" | "coach";
  disabled: boolean;
  onSend: (
    body: string,
    attachment: MessageAttachmentInput | null
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Nettoyage du fichier déposé puis abandonné (bucket privé). */
  onDiscardAttachment: (path: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<MessageAttachmentInput | null>(null);
  // aperçu local : la photo s'affiche sans attendre l'URL signée du serveur
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Entrée envoie-t-elle ? Au doigt, non : elle saute une ligne.
  const [enterSends, setEnterSends] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const recorder = useVoiceRecorder((file, seconds) => void attachFile(file, seconds));

  const ed = variant === "editorial";
  const busy = disabled || isUploading || isSending;
  const canSend = (draft.trim().length > 0 || attachment !== null) && !busy;

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine)");
    const apply = () => setEnterSends(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // la zone grandit avec le texte, jusqu'à un plafond au-delà duquel elle défile
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [draft]);

  // un aperçu local n'est valable que le temps du montage
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function attachFile(file: File, duration: number | null) {
    setError(null);
    setIsUploading(true);
    // un nouveau fichier remplace le précédent : on ne laisse pas le premier
    // traîner dans le bucket
    if (attachment) onDiscardAttachment(attachment.path);
    setAttachment(null);
    setPreviewUrl(null);

    const result = await uploadMessageAttachment(playerId, file, duration);
    setIsUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAttachment(result.attachment);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function removeAttachment() {
    if (attachment) onDiscardAttachment(attachment.path);
    setAttachment(null);
    setPreviewUrl(null);
  }

  async function send() {
    if (!canSend) return;
    setError(null);
    setIsSending(true);
    const result = await onSend(draft.trim(), attachment);
    setIsSending(false);
    if (!result.ok) {
      setError(result.error ?? "Envoi impossible.");
      return;
    }
    setDraft("");
    setAttachment(null);
    setPreviewUrl(null);
    textareaRef.current?.focus();
  }

  const message = error ?? recorder.error;
  const remaining = MESSAGE_MAX_LENGTH - draft.length;

  return (
    <div
      className={`mt-3 shrink-0 ${ed ? "border-t-2 border-ink pt-3" : "border-t border-navy-100 pt-3"}`}
    >
      {message && (
        <p
          className={
            ed
              ? "ed-meta mb-2 text-[11px] text-orange"
              : "mb-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"
          }
        >
          {message}
        </p>
      )}

      {/* ---- Enregistrement en cours : la barre remplace la saisie ---- */}
      {recorder.isRecording ? (
        <div
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
            ed ? "border-2 border-orange bg-card" : "border border-danger bg-danger-soft"
          }`}
        >
          <span
            aria-hidden
            className={`h-2.5 w-2.5 animate-pulse rounded-full ${ed ? "bg-orange" : "bg-danger"}`}
          />
          <span className={`flex-1 text-sm font-semibold tabular-nums ${ed ? "text-ink" : "text-danger"}`}>
            Enregistrement… {formatDuration(recorder.seconds)}
          </span>
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Annuler le vocal"
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              ed ? "text-meta hover:text-ink" : "text-navy-400 hover:text-navy-800"
            }`}
          >
            <Trash2 size={17} />
          </button>
          <button
            type="button"
            onClick={recorder.stop}
            aria-label="Terminer le vocal"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 ${
              ed ? "bg-ink" : "bg-navy-800"
            }`}
          >
            <SendHorizontal size={17} />
          </button>
        </div>
      ) : (
        <>
          {/* ---- Pièce jointe prête à partir ---- */}
          {(isUploading || attachment) && (
            <div
              className={`mb-2 flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                ed ? "border-2 border-ink/15 bg-card" : "bg-navy-50"
              }`}
            >
              {isUploading ? (
                <span className={`flex-1 text-xs font-semibold ${ed ? "text-meta" : "text-navy-500"}`}>
                  Transfert du fichier…
                </span>
              ) : (
                attachment && (
                  <>
                    {previewUrl && attachment.kind === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                      <img
                        src={previewUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    {previewUrl && attachment.kind === "video" && (
                      <video
                        src={previewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-xs font-semibold ${ed ? "text-ink" : "text-navy-800"}`}
                      >
                        {attachment.kind === "audio"
                          ? `Message vocal · ${formatDuration(attachment.duration ?? 0)}`
                          : attachment.name}
                      </span>
                      <span className={`block text-[10px] ${ed ? "text-meta" : "text-navy-400"}`}>
                        Prêt à envoyer · {formatBytes(attachment.size)}
                      </span>
                    </span>
                    {/* écoute avant envoi : un vocal ne part pas à l'aveugle */}
                    {attachment.kind === "audio" && previewUrl && (
                      <audio src={previewUrl} controls className="h-8 max-w-[130px]" />
                    )}
                    <button
                      type="button"
                      onClick={removeAttachment}
                      aria-label="Retirer la pièce jointe"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        ed ? "text-meta hover:text-ink" : "text-navy-400 hover:text-navy-800"
                      }`}
                    >
                      <X size={16} />
                    </button>
                  </>
                )
              )}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void attachFile(file, null);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="Joindre une photo, une vidéo ou un fichier"
              className={`flex h-11 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40 ${
                ed ? "text-meta hover:text-ink" : "text-navy-400 hover:text-navy-800"
              }`}
            >
              <Paperclip size={19} />
            </button>

            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
              onKeyDown={(e) => {
                // au doigt, Entrée saute une ligne (pas de touche Maj) ; à la
                // souris elle envoie, et Maj+Entrée saute la ligne
                if (e.key === "Enter" && enterSends && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              enterKeyHint={enterSends ? "send" : "enter"}
              placeholder="Écris ton message…"
              className={
                ed
                  ? "ed-field max-h-[140px] w-full flex-1 resize-none overflow-y-auto"
                  : "max-h-[140px] w-full flex-1 resize-none overflow-y-auto rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
              }
            />

            {/* micro tant qu'il n'y a rien à envoyer, avion dès qu'il y a
                quelque chose : un seul bouton principal à l'écran */}
            {canSend || draft.trim() || attachment ? (
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                aria-label="Envoyer le message"
                className={
                  ed
                    ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-ink text-paper transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
                }
              >
                <SendHorizontal size={18} />
              </button>
            ) : (
              recorder.isSupported && (
                <button
                  type="button"
                  onClick={() => void recorder.start()}
                  disabled={busy}
                  aria-label="Enregistrer un message vocal"
                  className={
                    ed
                      ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-card text-ink transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                      : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-white text-navy-600 transition-colors hover:bg-navy-50 disabled:opacity-40"
                  }
                >
                  <Mic size={18} />
                </button>
              )
            )}
          </div>

          {remaining <= COUNTER_THRESHOLD && (
            <p className={`mt-1 text-right text-[10px] ${ed ? "text-meta" : "text-navy-400"}`}>
              {remaining} caractère{remaining > 1 ? "s" : ""} restant
              {remaining > 1 ? "s" : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}
