"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "vpf-install-dismissed";

/**
 * Invite d'installation PWA (Android/Chrome) : capte `beforeinstallprompt`,
 * propose une bannière discrète, une seule fois (choix mémorisé). Masquée si
 * l'app tourne déjà en mode installé.
 */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    dismiss();
  }

  if (!show || !evt) return null;

  return (
    <div className="animate-slide-down fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-navy-100 bg-white p-3.5 shadow-lg">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-gold">
        <Download size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-navy-900">Installe VPF</p>
        <p className="text-xs text-navy-400">Accès direct depuis ton écran d&apos;accueil.</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 rounded-xl bg-navy-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40"
      >
        Installer
      </button>
      <button
        onClick={dismiss}
        aria-label="Fermer"
        className="shrink-0 rounded-full p-1 text-navy-400 hover:bg-navy-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40"
      >
        <X size={18} />
      </button>
    </div>
  );
}
