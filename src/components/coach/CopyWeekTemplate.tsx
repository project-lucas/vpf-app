"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { copyWeekTemplate } from "@/app/actions/planning";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * Action groupée : recopie la semaine type d'un autre joueur du coach sur ce
 * joueur (remplace l'existant). Évite de reconstruire le même planning à la
 * main joueur par joueur.
 */
export function CopyWeekTemplate({
  playerId,
  playerName,
  otherPlayers,
}: {
  playerId: string;
  playerName: string;
  otherPlayers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (otherPlayers.length === 0) return null;

  function confirm() {
    if (!sourceId) return;
    startTransition(async () => {
      const result = await copyWeekTemplate(sourceId, playerId);
      if (result.ok) {
        setOpen(false);
        setSourceId("");
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-800"
      >
        <Copy size={13} />
        Copier depuis un joueur
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Copier une semaine type">
        <p className="mb-3 text-sm text-navy-500">
          La semaine type du joueur choisi remplacera celle de {playerName}. Les pointages déjà
          faits sont conservés.
        </p>
        <div className="space-y-1.5">
          {otherPlayers.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 px-3.5 py-2.5"
            >
              <input
                type="radio"
                name="copy-source"
                checked={sourceId === p.id}
                onChange={() => setSourceId(p.id)}
                className="h-4 w-4 accent-navy-800"
              />
              <span className="text-sm font-semibold text-navy-800">{p.name}</span>
            </label>
          ))}
        </div>
        {error && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full onClick={() => setOpen(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button full onClick={confirm} disabled={isPending || !sourceId}>
            Remplacer la semaine
          </Button>
        </div>
      </Modal>
    </>
  );
}
