"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavUnreadFlag } from "@/app/actions/messages";

/** Cadence du guet des messages non lus — celle du reste de la messagerie. */
const UNREAD_POLL_MS = 30_000;

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  /** pastille rouge sur l'icône : du non-lu attend derrière cet onglet */
  dot?: boolean;
}

/** Pastille de non-lu, posée sur le coin de l'icône. */
function Dot({ variant }: { variant: "default" | "editorial" }) {
  return (
    <span
      aria-hidden
      className={`absolute right-[calc(50%-16px)] top-1.5 h-2.5 w-2.5 rounded-full ${
        variant === "editorial" ? "border-2 border-tan bg-orange" : "border-2 border-white bg-danger"
      }`}
    />
  );
}

export function BottomNav({
  items,
  variant = "default",
  messagesHref,
}: {
  items: NavItem[];
  variant?: "default" | "editorial";
  /**
   * Onglet qui porte la messagerie (Messages côté joueur, Joueurs côté staff).
   * Sa pastille se rafraîchit toute seule : un message qui arrive doit se voir
   * sans navigation, sinon la pastille ne prévient de rien.
   */
  messagesHref?: string;
}) {
  const pathname = usePathname();
  // null tant qu'on n'a pas mesuré : la valeur du serveur fait foi d'ici là
  const [liveUnread, setLiveUnread] = useState<boolean | null>(null);

  useEffect(() => {
    if (!messagesHref) return;

    // la navigation vient de rapporter une valeur serveur fraîche : on repart
    // d'elle, la mesure vivante la reprendra au tour suivant
    setLiveUnread(null);

    const check = async () => setLiveUnread(await getNavUnreadFlag());
    const id = setInterval(() => void check(), UNREAD_POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [messagesHref, pathname]);

  // une fois mesurée, la valeur vivante remplace celle du serveur — sinon la
  // pastille resterait allumée après avoir lu le fil
  const showDot = (item: NavItem) =>
    item.href === messagesHref && liveUnread !== null ? liveUnread : item.dot;

  if (variant === "editorial") {
    return (
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-tan">
        <div className="flex w-full items-stretch">
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 transition-colors ${
                  active ? "text-ink" : "text-meta"
                }`}
              >
                {/* trait rouge brique : repère de l'onglet actif */}
                {active && (
                  <span aria-hidden className="absolute top-0 h-[3px] w-8 bg-orange" />
                )}
                {showDot(item) && <Dot variant="editorial" />}
                {item.icon}
                {/* truncate : en offre formation la barre porte 5 onglets, et
                    « PROGRAMME » en mono espacé frôle la largeur d'une case sur
                    un écran 320px — mieux vaut l'ellipser que passer à la ligne
                    et épaissir la barre */}
                <span className="ed-meta w-full truncate text-center text-[9px]">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-navy-100 bg-white">
      <div className="mx-auto flex max-w-lg items-stretch">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors ${
                active ? "text-navy-800" : "text-navy-500"
              }`}
            >
              {/* tick doré : repère de l'onglet actif */}
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 h-[3px] w-7 -skew-x-12 rounded-b-sm bg-accent"
                />
              )}
              {showDot(item) && <Dot variant="default" />}
              {item.icon}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
