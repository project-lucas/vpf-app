"use client";

import { usePathname } from "next/navigation";

/**
 * La colonne de contenu du staff. Sur ordinateur, l'accueil (vue tableau,
 * historique des semaines) prend toute la largeur de l'écran ; les autres
 * pages restent à 1280 px, lisibles. Sur téléphone, rien ne change.
 */
export function StaffMain({ children }: { children: React.ReactNode }) {
  const wide = usePathname() === "/coach";
  return (
    <main
      className={`mx-auto w-full px-4 pb-32 pt-1 lg:px-8 lg:pb-12 lg:pt-7 ${
        wide ? "max-w-[1280px] lg:max-w-none" : "max-w-[1280px]"
      }`}
    >
      {children}
    </main>
  );
}
