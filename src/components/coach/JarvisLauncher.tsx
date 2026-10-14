"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { JarvisAvatar } from "@/components/coach/JarvisAvatar";
import { JarvisChat } from "@/components/coach/JarvisChat";

/** La fiche d'un joueur ouverte : Jarvis parle alors de lui. */
const FICHE_RE = /^\/coach\/joueurs\/([0-9a-f-]{36})/;

/**
 * Jarvis partout dans l'espace staff : la tête en haut à droite de chaque
 * page et en bouton flottant en bas à droite. Les deux ouvrent le même volet
 * de conversation. Sur la fiche d'un joueur, Jarvis sait de qui on parle.
 */
export function JarvisLauncher({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const focusId = pathname.match(FICHE_RE)?.[1] ?? null;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* en haut à droite — sauf sur l'accueil, qui a déjà son bouton Jarvis */}
      {pathname !== "/coach" && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir Jarvis"
          title="Jarvis"
          className="absolute right-[60px] top-2.5 z-30 flex items-center gap-2 rounded-full bg-navy-800 p-0.5 text-[13px] font-extrabold text-white shadow-md transition-transform hover:scale-[1.03] lg:right-6 lg:top-4 lg:py-1 lg:pl-1 lg:pr-3.5"
        >
          <JarvisAvatar size={38} />
          <span className="hidden lg:inline">Jarvis</span>
        </button>
      )}

      {/* flottant en bas à droite, sur tous les onglets */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Parler à Jarvis"
        title="Parler à Jarvis"
        className="jarvis-float bottom-above-nav fixed right-4 z-40 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-navy-900 shadow-[0_10px_30px_-6px_rgba(10,29,51,0.55)] transition-transform hover:scale-105 lg:bottom-6 lg:right-6 lg:h-[76px] lg:w-[76px]"
      >
        <JarvisAvatar size={58} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Fermer Jarvis"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-900/40"
          />
          <aside
            role="dialog"
            aria-labelledby="jarvis-launcher-title"
            className="relative flex h-full w-full max-w-[520px] flex-col bg-cream shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-sand bg-white px-5 py-4">
              <h2
                id="jarvis-launcher-title"
                className="font-display flex items-center gap-3 text-[20px] font-extrabold uppercase tracking-wide text-navy-900"
              >
                <JarvisAvatar size={48} />
                Jarvis
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-full text-navy-500 hover:bg-cream"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-[13px] text-navy-500">
                {focusId
                  ? "Je suis sur la fiche de ce joueur : demande-moi ce que tu veux à son sujet."
                  : "Une question sur le groupe, ou une action à faire pour un joueur ?"}{" "}
                <Link
                  href="/coach?jarvis=1"
                  className="font-semibold text-accent hover:underline"
                >
                  Voir les recommandations du matin
                </Link>
              </p>
              <JarvisChat
                groupId={null}
                configured={configured}
                focus={focusId ? { id: focusId, firstName: "ce joueur" } : null}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
