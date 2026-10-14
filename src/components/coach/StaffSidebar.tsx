"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavUnreadFlag } from "@/app/actions/messages";
import type { NavItem } from "@/components/BottomNav";

/** Cadence du guet des messages non lus — celle de la barre du bas. */
const UNREAD_POLL_MS = 30_000;

/**
 * La barre latérale du staff sur ordinateur (≥ lg). Les mêmes onglets que la
 * barre du bas, plus les entrées du menu (Relais messages, Réglages) et le
 * bloc utilisateur. Sur téléphone, elle n'existe pas : la barre du bas et le
 * menu aux initiales gardent la main.
 */
export function StaffSidebar({
  items,
  secondary,
  initials,
  name,
  roleLabel,
  messagesHref,
}: {
  items: NavItem[];
  secondary: { href: string; label: string; icon: React.ReactNode }[];
  initials: string;
  name: string;
  roleLabel: string;
  messagesHref?: string;
}) {
  const pathname = usePathname();
  const [liveUnread, setLiveUnread] = useState<boolean | null>(null);

  useEffect(() => {
    if (!messagesHref) return;
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

  const isActive = (item: { href: string; exact?: boolean }) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
  const showDot = (item: NavItem) =>
    item.href === messagesHref && liveUnread !== null ? liveUnread : item.dot;

  return (
    <nav
      aria-label="Navigation du staff"
      className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-1 bg-navy-800 px-3.5 py-5"
    >
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <span className="font-display flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[15px] font-bold tracking-wider text-navy-800">
          VPF
        </span>
        <span className="flex flex-col">
          <span className="font-display text-[15px] font-bold uppercase tracking-wider text-white">
            Centre de perf
          </span>
          <span className="text-[11px] text-navy-300">Espace staff</span>
        </span>
      </div>

      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors ${
              active ? "bg-navy-900 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{item.icon}</span>
            {item.label}
            {showDot(item) && (
              <span aria-label="Non lu" className="ml-auto h-2.5 w-2.5 rounded-full bg-danger" />
            )}
          </Link>
        );
      })}

      <div className="mt-3 border-t border-white/10 pt-3">
        {secondary.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-colors ${
                active ? "bg-navy-900 text-white" : "text-navy-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 px-2 pt-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-[11px] font-extrabold text-navy-900">
          {initials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-white">{name}</span>
          <span className="text-[11px] text-navy-300">{roleLabel}</span>
        </span>
      </div>
    </nav>
  );
}
