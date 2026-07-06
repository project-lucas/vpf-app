import { WifiOff } from "lucide-react";

export const metadata = { title: "Hors ligne — VPF" };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-100 text-navy-500">
        <WifiOff size={30} strokeWidth={1.8} />
      </span>
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-navy-900">
        Hors ligne
      </h1>
      <p className="max-w-xs text-sm text-navy-500">
        Pas de connexion pour le moment. Reconnecte-toi à Internet pour retrouver ton espace VPF.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- rechargement dur volontaire pour retenter la connexion */}
      <a
        href="/"
        className="rounded-xl bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
      >
        Réessayer
      </a>
    </div>
  );
}
