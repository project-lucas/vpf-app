"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BicepsFlexed, Cross, TreePalm } from "lucide-react";
import { setPlayerAvailability } from "@/app/actions/coach";
import { AVAILABILITY_LABELS } from "@/lib/constants";
import type { PlayerAvailability } from "@/lib/types";

const OPTIONS: { value: PlayerAvailability; icon: React.ReactNode }[] = [
  { value: "available", icon: <BicepsFlexed size={13} /> },
  { value: "injured", icon: <Cross size={13} /> },
  { value: "vacation", icon: <TreePalm size={13} /> },
];

/**
 * Sélecteur de disponibilité sur la fiche joueur. Blessé / vacances gèle la
 * série et les rappels du joueur et le sort des moyennes et alertes du
 * dashboard — sa discipline n'est plus pénalisée pendant l'absence.
 */
export function AvailabilityControl({
  playerId,
  availability,
}: {
  playerId: string;
  availability: PlayerAvailability;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(value: PlayerAvailability) {
    if (value === availability || isPending) return;
    startTransition(async () => {
      const result = await setPlayerAvailability(playerId, value);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="inline-flex overflow-hidden rounded-full border border-navy-200">
      {OPTIONS.map((o) => {
        const active = o.value === availability;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            disabled={isPending}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? o.value === "available"
                  ? "bg-success text-white"
                  : o.value === "injured"
                    ? "bg-danger text-white"
                    : "bg-navy-600 text-white"
                : "bg-white text-navy-400 hover:text-navy-700"
            }`}
          >
            {o.icon}
            {AVAILABILITY_LABELS[o.value]}
          </button>
        );
      })}
    </div>
  );
}
