"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export function BottomNav({
  items,
  variant = "default",
}: {
  items: NavItem[];
  variant?: "default" | "editorial";
}) {
  const pathname = usePathname();

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
                {item.icon}
                <span className="ed-meta text-[9px]">{item.label}</span>
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
                  className="absolute top-0 h-[3px] w-7 -skew-x-12 rounded-b-sm bg-gold"
                />
              )}
              {item.icon}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
