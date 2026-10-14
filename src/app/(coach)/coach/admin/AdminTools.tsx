"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface AdminTool {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** pastille de compte (annonces, invitations en attente) */
  count?: number;
  content: React.ReactNode;
}

/**
 * La barre d'outils de l'onglet Admin : les gestes rares (annonces, Jarvis
 * du matin, nouveau coach, nouveau joueur) en boutons sur une ligne, chacun
 * ouvert dans un volet latéral — la page, elle, ne bouge pas et ne défile pas.
 * Les contenus sont montés d'entrée (masqués) pour garder leurs saisies.
 */
export function AdminTools({ tools }: { tools: AdminTool[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const current = tools.find((t) => t.key === open) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {tools.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpen(t.key)}
            className="shadow-soft inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-[13px] font-bold text-navy-800 transition-colors hover:text-accent"
          >
            <span className="text-accent">{t.icon}</span>
            {t.label}
            {t.count ? (
              <span className="rounded-full bg-cream px-1.5 text-[11px] font-extrabold tabular-nums text-navy-500">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={open ? "fixed inset-0 z-50 flex justify-end" : "hidden"}>
        <button
          type="button"
          aria-label="Fermer"
          onClick={() => setOpen(null)}
          className="absolute inset-0 bg-navy-900/40"
        />
        <aside
          role="dialog"
          aria-labelledby="admin-tool-title"
          className="relative flex h-full w-full max-w-[560px] flex-col bg-cream shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-sand bg-white px-5 py-4">
            <h2
              id="admin-tool-title"
              className="font-display flex items-center gap-2.5 text-[20px] font-extrabold uppercase tracking-wide text-navy-900"
            >
              <span className="text-accent">{current?.icon}</span>
              {current?.label}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Fermer"
              className="flex h-9 w-9 items-center justify-center rounded-full text-navy-500 hover:bg-cream"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tools.map((t) => (
              <div key={t.key} hidden={t.key !== open}>
                {t.content}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
