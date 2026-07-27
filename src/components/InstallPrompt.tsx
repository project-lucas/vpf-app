"use client";

import { useEffect, useState } from "react";
import { Download, SquarePlus, Upload, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "vpf-install-dismissed";
// Refus = report, pas abandon : sans installation, pas de notifications push
// (surtout sur iPhone), donc on re-propose après quelques jours.
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function isSnoozed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  // Ancienne valeur "1" (refus définitif d'avant le snooze) : on re-propose.
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < SNOOZE_MS;
}

/**
 * Invite d'installation PWA.
 * - Android/Chrome : capte `beforeinstallprompt` et déclenche l'installation native.
 * - iPhone/iPad : Safari n'a ni `beforeinstallprompt` ni l'API Notification tant
 *   que l'app n'est pas sur l'écran d'accueil — on affiche les étapes manuelles,
 *   sinon le joueur ne peut jamais activer les rappels push.
 * Masquée en mode installé ; un refus la reporte de quelques jours.
 */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "native" | "ios">("hidden");

  useEffect(() => {
    if (isSnoozed()) return;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as { standalone?: boolean }).standalone === true);
    if (isStandalone) return;

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIos) {
      setMode("ios");
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setMode("native");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setMode("hidden");
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    dismiss();
  }

  if (mode === "hidden") return null;

  if (mode === "ios") {
    return (
      <div className="animate-slide-down fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl border border-navy-100 bg-white p-3.5 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-gold">
            <Download size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy-900">
              Installe VPF pour recevoir les rappels
            </p>
            <p className="mt-1 text-xs leading-relaxed text-navy-400">
              Appuie sur <Upload size={12} className="-mt-0.5 inline" />{" "}
              <strong>Partager</strong> puis «{" "}
              <SquarePlus size={12} className="-mt-0.5 inline" /> Sur l&apos;écran
              d&apos;accueil ». Ouvre ensuite l&apos;app et active les
              notifications.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Fermer"
            className="shrink-0 rounded-full p-1 text-navy-400 hover:bg-navy-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (!evt) return null;

  return (
    <div className="animate-slide-down fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-navy-100 bg-white p-3.5 shadow-lg">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-gold">
        <Download size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-navy-900">Installe VPF</p>
        <p className="text-xs text-navy-400">
          Accès direct et rappels depuis ton écran d&apos;accueil.
        </p>
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
