"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  variant = "default",
}: {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** "retro" : panneau crème bordé navy, titre varsity (écrans joueur) */
  variant?: "default" | "retro";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // onClose est presque toujours une fonction inline (identité changeante à
  // chaque rendu du parent) : on la lit via une ref pour NE PAS relancer l'effet
  // à chaque frappe (sinon le focus est volé du champ vers le bouton Fermer).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // mémorise l'élément déclencheur pour lui rendre le focus à la fermeture
    const trigger = document.activeElement as HTMLElement | null;

    // verrouille le défilement de l'arrière-plan (surtout sur mobile)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // place le focus dans la modale (premier élément focusable, sinon le panneau)
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      // piège de focus : Tab boucle à l'intérieur du panneau
      if (e.key === "Tab" && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        const activeEl = document.activeElement;
        if (e.shiftKey && activeEl === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && activeEl === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const retro = variant === "retro";

  return createPortal(
    // centrée verticalement, hauteur max 90vh avec défilement interne ;
    // portal vers <body> pour échapper aux transforms des parents
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 ${retro ? "bg-[#1c3a4b]/60" : "bg-navy-900/50"}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`animate-pop relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto focus:outline-none ${
          retro
            ? "rounded-lg border-2 border-ink bg-card p-5"
            : "rounded-3xl bg-white p-5 shadow-xl"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          {title ? (
            <h2
              id={titleId}
              className={retro ? "ed-value text-2xl text-ink" : "text-lg font-extrabold text-navy-900"}
            >
              {title}
            </h2>
          ) : (
            <span />
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className={
                retro
                  ? "rounded-md p-1 text-ink hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  : "rounded-full p-1 text-navy-400 hover:bg-navy-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40"
              }
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
