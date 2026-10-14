"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { formatAgoFr } from "@/lib/dates";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import type { ConversationMessageWithSender, UserRole } from "@/lib/types";
import { MessageAttachment } from "./MessageAttachment";

/** Étiquette de rôle affichée sous le nom de l'expéditeur (rien pour le joueur). */
function roleLabel(role: UserRole | null): string {
  if (role === "coach") return "Coach";
  if (role === "admin") return "Staff VPF";
  if (role === "parent") return "Parent";
  return "";
}

/**
 * Un message du fil : sa bulle, sa pièce jointe éventuelle, et — pour ses
 * propres messages — la modification et la suppression.
 *
 * La modification (0036) réécrit le texte sur place et laisse la mention
 * « modifié » : le fil reste honnête, personne ne réécrit l'histoire en
 * silence. La pièce jointe, elle, ne se remplace jamais — on supprime.
 *
 * Les actions vivent SOUS la bulle, sur la ligne de l'heure : posées à côté
 * de la bulle, elles se faisaient couper sur un téléphone dès que le message
 * était un peu long (la bulle prenait toute la largeur). Sous la bulle, elles
 * ont toujours la place, et restent visibles sans survol — au doigt, il n'y a
 * pas de survol.
 */
export function MessageBubble({
  message,
  own,
  variant,
  disabled,
  onEdit,
  onDelete,
}: {
  message: ConversationMessageWithSender;
  own: boolean;
  variant: "editorial" | "coach";
  disabled: boolean;
  onEdit: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const ed = variant === "editorial";
  const metaColor = ed ? "text-meta" : "text-navy-400";
  const dangerColor = ed ? "text-orange" : "text-danger";
  const label = roleLabel(message.sender_role);

  // la zone d'édition suit la hauteur du texte…
  useLayoutEffect(() => {
    const el = editRef.current;
    if (!isEditing || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [isEditing, draft]);

  // …et ne prend le curseur qu'à l'ouverture : le replacer à chaque frappe
  // empêcherait de corriger un mot au milieu du message
  useLayoutEffect(() => {
    const el = editRef.current;
    if (!isEditing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  function startEdit() {
    setDraft(message.body);
    setError(null);
    setIsConfirming(false);
    setIsEditing(true);
  }

  async function save() {
    const body = draft.trim();
    if (body === message.body.trim()) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    const result = await onEdit(message.id, body);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Modification impossible.");
      return;
    }
    setIsEditing(false);
  }

  const bubbleOwn = ed ? "bg-ink text-paper" : "bg-navy-800 text-white";
  const bubbleOther = ed
    ? "border-2 border-ink/15 bg-card text-ink"
    : "bg-navy-50 text-navy-800";

  // zone de toucher confortable sans épaissir la ligne : le bouton déborde
  // verticalement sur ses marges négatives
  const iconButton = `-my-1.5 rounded-md p-2 transition-opacity hover:opacity-100 ${metaColor} opacity-70`;

  return (
    <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
      <div className={`min-w-0 max-w-[85%] ${own ? "text-right" : "text-left"}`}>
        {!own && (
          <p className={`mb-0.5 text-[11px] font-semibold ${metaColor}`}>
            {message.sender_name}
            {label && <span className={ed ? "text-orange" : "text-navy-500"}> · {label}</span>}
          </p>
        )}

        <div
          className={`inline-block max-w-full rounded-lg px-3.5 py-2.5 text-left text-sm leading-relaxed ${
            own ? bubbleOwn : bubbleOther
          }`}
        >
          {message.attachment_kind && (
            <div className={message.body ? "mb-2" : ""}>
              <MessageAttachment
                url={message.attachment_url}
                kind={message.attachment_kind}
                name={message.attachment_name ?? "pièce jointe"}
                size={message.attachment_size}
                duration={message.attachment_duration}
                own={own}
                variant={variant}
              />
            </div>
          )}

          {isEditing ? (
            <div className="w-[min(70vw,320px)] max-w-full">
              <textarea
                ref={editRef}
                value={draft}
                rows={1}
                onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsEditing(false);
                }}
                className={`w-full resize-none rounded-md px-2 py-1.5 text-sm ${
                  own ? "bg-white/15 text-inherit" : ed ? "bg-paper text-ink" : "bg-white text-navy-800"
                }`}
              />
              <div className="mt-1.5 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  aria-label="Annuler la modification"
                  className="rounded-md p-2 opacity-70 transition-opacity hover:opacity-100"
                >
                  <X size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={isSaving}
                  aria-label="Enregistrer la modification"
                  className="rounded-md p-2 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ) : (
            message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
        </div>

        {error && <p className={`mt-0.5 text-[10px] ${dangerColor}`}>{error}</p>}

        {/* Heure, mention « modifié », et — pour ses propres messages — les
            actions. La RLS refuse de toute façon de toucher aux autres. */}
        <p
          className={`mt-0.5 flex items-center gap-0.5 text-[10px] ${metaColor} ${
            own ? "justify-end" : ""
          }`}
        >
          <span>
            {formatAgoFr(message.created_at)}
            {message.edited_at && " · modifié"}
          </span>
          {own &&
            !isEditing &&
            (isConfirming ? (
              <>
                <span aria-hidden className="mx-0.5">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(message.id)}
                  disabled={disabled}
                  className={`-my-1 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${dangerColor} disabled:opacity-40`}
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  aria-label="Annuler la suppression"
                  className={`-my-1 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${metaColor}`}
                >
                  Non
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="Modifier mon message"
                  className={`ml-1 ${iconButton}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(true)}
                  aria-label="Supprimer mon message"
                  className={iconButton}
                >
                  <Trash2 size={13} />
                </button>
              </>
            ))}
        </p>
      </div>
    </div>
  );
}
