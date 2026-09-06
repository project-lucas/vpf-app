"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BicepsFlexed, Cross, MessageCircle, MoreHorizontal, TreePalm, User } from "lucide-react";
import { setPlayerAvailability } from "@/app/actions/coach";
import { AVAILABILITY_LABELS } from "@/lib/constants";
import type { PlayerAvailability } from "@/lib/types";

const AVAILABILITY_ICONS: Record<PlayerAvailability, React.ReactNode> = {
  available: <BicepsFlexed size={14} />,
  injured: <Cross size={14} />,
  vacation: <TreePalm size={14} />,
};

/**
 * Menu « ⋯ » d'une ligne joueur : les trois gestes courants sans ouvrir la
 * fiche — écrire, changer la disponibilité, ouvrir la fiche. Passer un joueur
 * en blessé coûtait quatre clics ; ici deux.
 */
export function RowMenu({
  playerId,
  playerName,
  availability,
  hideFicheLink = false,
}: {
  playerId: string;
  playerName: string;
  availability: PlayerAvailability;
  /** sur la fiche elle-même, « Ouvrir la fiche » n'a pas de sens */
  hideFicheLink?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

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

  function setAvailability(value: PlayerAvailability) {
    if (value === availability) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await setPlayerAvailability(playerId, value);
      if (result.ok) router.refresh();
      setOpen(false);
    });
  }

  const itemClass =
    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50 disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions pour ${playerName}`}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-navy-800 text-white" : "text-navy-300 hover:bg-navy-100 hover:text-navy-700"
        }`}
      >
        <MoreHorizontal size={17} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-navy-100 bg-white py-1 shadow-lg"
        >
          <Link
            href={`/coach/joueurs/${playerId}?onglet=messages`}
            role="menuitem"
            className={itemClass}
          >
            <MessageCircle size={15} className="text-navy-400" /> Écrire
          </Link>
          {!hideFicheLink && (
            <Link href={`/coach/joueurs/${playerId}`} role="menuitem" className={itemClass}>
              <User size={15} className="text-navy-400" /> Ouvrir la fiche
            </Link>
          )}
          <p className="mt-1 border-t border-navy-100 px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">
            Disponibilité
          </p>
          {(Object.keys(AVAILABILITY_LABELS) as PlayerAvailability[]).map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === availability}
              onClick={() => setAvailability(value)}
              disabled={isPending}
              className={`${itemClass} ${value === availability ? "text-navy-900" : ""}`}
            >
              <span className={value === availability ? "text-navy-800" : "text-navy-400"}>
                {AVAILABILITY_ICONS[value]}
              </span>
              {AVAILABILITY_LABELS[value]}
              {value === availability && (
                <span className="ml-auto text-[10px] font-bold uppercase text-navy-400">actuel</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
