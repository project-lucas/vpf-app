"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, Settings, Trophy, X } from "lucide-react";

/**
 * Menu du staff, en haut à droite : les entrées qu'on ouvre une fois par
 * semaine (Staff) ou par saison (Réglages), sorties de la barre du bas pour la
 * ramener à cinq onglets — ce qu'on fait tous les jours.
 *
 * Un cercle aux initiales, un petit panneau. Il se ferme au clic dehors, à
 * Échap, et à chaque navigation.
 */
export function StaffMenu({ initials, isAdmin }: { initials: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const items = [
    ...(isAdmin
      ? [
          { href: "/coach/club", label: "Staff", icon: <Trophy size={15} /> },
          // les fils privés des collègues admins : du relais, pas du quotidien
          { href: "/coach/messages", label: "Relais messages", icon: <MessagesSquare size={15} /> },
        ]
      : []),
    { href: "/coach/parametres", label: "Réglages", icon: <Settings size={15} /> },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu du staff"
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-extrabold transition-colors ${
          open
            ? "border-navy-800 bg-navy-800 text-white"
            : "border-navy-200 bg-white text-navy-800 hover:border-navy-400"
        }`}
      >
        {open ? <X size={16} /> : initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-navy-100 bg-white shadow-lg"
        >
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-navy-50 ${
                  active ? "text-navy-900" : "text-navy-600"
                }`}
              >
                <span className="text-navy-400">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
