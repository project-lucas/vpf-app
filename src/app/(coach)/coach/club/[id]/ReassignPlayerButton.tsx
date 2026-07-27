"use client";

import { useState, useTransition } from "react";
import { reassignPlayer } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select } from "@/components/ui/Field";

export interface StaffOption {
  id: string;
  name: string;
  isAdmin: boolean;
  /** l'admin connecté, pour proposer « moi » explicitement */
  isMe: boolean;
}

/**
 * Réaffectation d'un joueur à un autre membre du staff. Réservé aux admins :
 * le bouton n'est rendu que par la page Staff, elle-même protégée côté serveur,
 * et l'action re-vérifie le rôle.
 */
export function ReassignPlayerButton({
  playerId,
  playerName,
  currentCoachName,
  staff,
}: {
  playerId: string;
  playerName: string;
  currentCoachName: string;
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // aucune destination possible : un seul membre de staff dans le club
  if (staff.length === 0) return null;

  function close() {
    setOpen(false);
    setTarget("");
    setError(null);
  }

  function confirm() {
    if (!target) {
      setError("Choisis un coach de destination.");
      return;
    }
    startTransition(async () => {
      const result = await reassignPlayer(playerId, target);
      if (result.ok) close();
      else setError(result.error);
    });
  }

  const targetName = staff.find((s) => s.id === target)?.name;

  return (
    <>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setOpen(true)}>
        Changer de coach
      </Button>

      <Modal open={open} onClose={close} title={`Changer le coach de ${playerName}`}>
        <p className="text-sm text-navy-500">
          Coach actuel : <span className="font-semibold text-navy-800">{currentCoachName}</span>
        </p>

        <div className="mt-4">
          <Field label="Nouveau coach référent">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isMe ? `${s.name} (moi)` : s.name}
                  {s.isAdmin ? " — admin" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-navy-500">
          <li>Le joueur, son planning, ses séances et ses statistiques sont conservés.</li>
          <li>
            {targetName ?? "Le nouveau coach"} verra ce joueur dans sa liste ; {currentCoachName}{" "}
            n&apos;y aura plus accès.
          </li>
          <li>
            <span className="font-semibold text-danger">
              Les notes privées écrites par {currentCoachName} seront supprimées.
            </span>{" "}
            Elles ne sont pas transmises au nouveau coach.
          </li>
        </ul>

        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full onClick={close} disabled={isPending}>
            Annuler
          </Button>
          <Button full onClick={confirm} disabled={isPending}>
            {isPending ? "Réaffectation…" : "Confirmer"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
