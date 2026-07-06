"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Target } from "lucide-react";
import { setWeekFocus } from "@/app/actions/coach";
import { Button } from "@/components/ui/Button";

const MAX_LENGTH = 200;

/**
 * Le coach écrit le focus de la semaine du joueur, affiché en tête de son
 * planning. Champ vide enregistré = focus retiré (le joueur retombe sur
 * l'axe de son dernier bilan).
 */
export function WeekFocusForm({
  playerId,
  initialContent,
}: {
  playerId: string;
  initialContent: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startTransition(async () => {
      const result = await setWeekFocus(playerId, content);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
      router.refresh();
    });
  }

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs text-navy-400">
        <Target size={13} className="shrink-0 text-warning" />
        Affiché en tête du planning du joueur, marqué « Défini par ton coach ».
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="Ex. : cette semaine, 100 % d'intensité sur les exercices de tir"
        rows={2}
        className="w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-navy-300">
          {content.length}/{MAX_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <Check size={12} /> Enregistré
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={save} disabled={isPending}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
