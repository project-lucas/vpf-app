"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import type { ConversationMessageWithSender, UserRole } from "@/lib/types";
import { MessageAttachment } from "./MessageAttachment";

/** Étiquette de rôle à côté du nom de l'expéditeur (rien pour le joueur). */
function roleLabel(role: UserRole | null): string {
  if (role === "coach") return "Coach";
  if (role === "admin") return "Staff VPF";
  if (role === "parent") return "Parent";
  return "";
}

/**
 * Couleur du prénom dans un fil à plusieurs, comme les groupes WhatsApp :
 * stable pour une même personne, lisible sur la bulle blanche.
 */
const NAME_COLORS = ["#d14d72", "#1f8a70", "#7b5ea7", "#c2601a", "#2a6fb0", "#a2384f", "#3b7a2a", "#b5651d"];
function nameColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

/** « 14:32 », en heure de Paris. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

/**
 * Un message du fil, façon WhatsApp : la bulle (verte à droite pour soi,
 * blanche à gauche pour les autres, prénom en couleur), sa pièce jointe, et
 * l'heure dans le coin de la bulle.
 *
 * Ses propres messages se modifient ou se suppriment depuis le petit menu de
 * la bulle (toujours visible : au doigt il n'y a pas de survol). La
 * modification (0036) laisse la mention « modifié » ; la pièce jointe ne se
 * remplace jamais — on supprime.
 */
export function MessageBubble({
  message,
  own,
  showName = true,
  disabled,
  onEdit,
  onDelete,
}: {
  message: ConversationMessageWithSender;
  own: boolean;
  /** prénom au-dessus du texte (masqué quand la même personne enchaîne) */
  showName?: boolean;
  variant?: "editorial" | "coach";
  disabled: boolean;
  onEdit: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const label = roleLabel(message.sender_role);

  // la zone d'édition suit la hauteur du texte…
  useLayoutEffect(() => {
    const el = editRef.current;
    if (!isEditing || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [isEditing, draft]);

  // …et ne prend le curseur qu'à l'ouverture
  useLayoutEffect(() => {
    const el = editRef.current;
    if (!isEditing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  function startEdit() {
    setDraft(message.body);
    setError(null);
    setMenuOpen(false);
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

  const meta = (
    <span className="ml-2 inline-flex translate-y-1 items-center gap-1 whitespace-nowrap align-bottom text-[11px] leading-none text-[#667781]">
      {message.edited_at && <span>modifié</span>}
      <span className="tabular-nums">{timeOf(message.created_at)}</span>
      {own && <Check size={13} strokeWidth={2.5} className="text-[#53bdeb]" aria-label="Envoyé" />}
    </span>
  );

  return (
    <div className={`flex px-[6%] ${own ? "justify-end" : "justify-start"}`}>
      <div
        className={`group relative min-w-[84px] max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[65%] ${
          own ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
        }`}
      >
        {/* le petit menu de ses propres messages */}
        {own && !isEditing && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setIsConfirming(false);
            }}
            aria-label="Options du message"
            aria-expanded={menuOpen}
            className="absolute right-1 top-1 rounded-full bg-[#d9fdd3]/90 p-0.5 text-[#667781] opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100"
          >
            <ChevronDown size={15} />
          </button>
        )}
        {menuOpen && (
          <div className="absolute right-1 top-6 z-10 w-40 overflow-hidden rounded-lg bg-white py-1 text-[14px] shadow-[0_2px_10px_rgba(11,20,26,0.2)]">
            {isConfirming ? (
              <>
                <p className="px-3 py-1.5 text-[12px] text-[#667781]">Supprimer pour tout le monde ?</p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(message.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#ea0038] hover:bg-[#f5f6f6] disabled:opacity-40"
                >
                  <Trash2 size={15} /> Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  className="w-full px-3 py-2 text-left hover:bg-[#f5f6f6]"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f6f6]"
                >
                  <Pencil size={15} /> Modifier
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f6f6]"
                >
                  <Trash2 size={15} /> Supprimer
                </button>
              </>
            )}
          </div>
        )}

        {!own && showName && (
          <p className="mb-0.5 pr-4 text-[12.5px] font-semibold" style={{ color: nameColor(message.sender_name) }}>
            {message.sender_name}
            {label && <span className="font-normal text-[#667781]"> · {label}</span>}
          </p>
        )}

        {message.attachment_kind && (
          <div className={message.body ? "mb-1" : ""}>
            <MessageAttachment
              url={message.attachment_url}
              kind={message.attachment_kind}
              name={message.attachment_name ?? "pièce jointe"}
              size={message.attachment_size}
              duration={message.attachment_duration}
              own={false}
              variant="coach"
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
              className="w-full resize-none rounded-md bg-white px-2 py-1.5 text-[14.5px] focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                aria-label="Annuler la modification"
                className="rounded-full p-1.5 text-[#667781] hover:bg-black/5"
              >
                <X size={16} />
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                aria-label="Enregistrer la modification"
                className="rounded-full bg-[#00a884] p-1.5 text-white disabled:opacity-40"
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        ) : message.body ? (
          <p className="whitespace-pre-wrap break-words">
            {message.body}
            {meta}
          </p>
        ) : (
          <p className="text-right">{meta}</p>
        )}

        {error && <p className="mt-1 text-[11px] font-semibold text-[#ea0038]">{error}</p>}
      </div>
    </div>
  );
}
