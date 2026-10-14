"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavUnreadFlag } from "@/app/actions/messages";
import { JarvisAvatar } from "@/components/coach/JarvisAvatar";
import type { NavItem } from "@/components/BottomNav";

/** Cadence du guet des messages non lus — celle de la barre du bas. */
const UNREAD_POLL_MS = 30_000;

/**
 * La barre latérale du staff sur ordinateur (≥ lg), direction « Parquet » :
 * blanche, l'onglet actif en orange doux, l'encart Jarvis en bas qui ouvre
 * son volet sur l'accueil. Sur téléphone, la barre du bas garde la main.
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
      className="sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col gap-1 border-r border-sand bg-white px-4 py-6"
    >
      <div className="flex items-center gap-3 px-2 pb-6">
        <span className="font-display flex h-10 w-10 items-center justify-center rounded-xl bg-navy-800 text-[16px] font-extrabold tracking-wider text-white">
          VPF
        </span>
        <span className="flex flex-col">
          <span className="font-display text-[16px] font-extrabold uppercase tracking-wider text-navy-900">
            Centre de perf
          </span>
          <span className="text-[11.5px] text-navy-400">Espace staff</span>
        </span>
      </div>

      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-accent-soft text-navy-900 shadow-[inset_3px_0_0_0_var(--color-accent)]"
                : "text-navy-500 hover:bg-cream hover:text-navy-900"
            }`}
          >
            <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{item.icon}</span>
            {item.label}
            {showDot(item) && (
              <span aria-label="Non lu" className="ml-auto h-2.5 w-2.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}

      <div className="mt-3 border-t border-sand pt-3">
        {secondary.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                active ? "bg-accent-soft text-navy-900" : "text-navy-400 hover:bg-cream hover:text-navy-900"
              }`}
            >
              <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-3">
        <Link
          href="/coach?jarvis=1"
          className="block rounded-2xl bg-navy-800 p-4 text-white transition-colors hover:bg-navy-700"
        >
          <span className="flex items-center gap-2.5">
            <JarvisAvatar size={34} />
            <span>
              <span className="font-display block text-[16px] font-extrabold uppercase tracking-wider">
                Jarvis
              </span>
              <span className="block text-[11.5px] text-navy-200">Ton assistant</span>
            </span>
          </span>
          <span className="mt-3 block rounded-lg bg-accent px-3 py-2 text-center text-[12px] font-extrabold">
            Parler à Jarvis
          </span>
        </Link>
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream text-[11px] font-extrabold text-navy-800">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-navy-900">{name}</span>
            <span className="text-[11px] text-navy-400">{roleLabel}</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
