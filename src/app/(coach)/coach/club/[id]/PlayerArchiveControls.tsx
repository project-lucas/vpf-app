"use client";

import { useState, useTransition } from "react";
import { archivePlayer, reactivatePlayer } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function ArchivePlayerButton({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmArchive() {
    startTransition(async () => {
      await archivePlayer(playerId);
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <Button size="sm" variant="danger" className="shrink-0" onClick={() => setConfirmOpen(true)}>
        Archiver
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Archiver ${playerName} ?`}
      >
        <ul className="list-inside list-disc space-y-1 text-sm text-navy-500">
          <li>Il ne pourra plus se connecter.</li>
          <li>Ses statistiques et son historique sont conservés.</li>
          <li>
            <span className="font-semibold text-danger">
              Les notes privées du coach seront définitivement supprimées.
            </span>
          </li>
          <li>Tu pourras le réactiver à tout moment.</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full onClick={() => setConfirmOpen(false)}>
            Annuler
          </Button>
          <Button variant="danger" full onClick={confirmArchive} disabled={isPending}>
            {isPending ? "Archivage…" : "Archiver"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function ReactivatePlayerButton({ playerId }: { playerId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="success"
      className="shrink-0"
      disabled={isPending}
      onClick={() => startTransition(async () => { await reactivatePlayer(playerId); })}
    >
      {isPending ? "Réactivation…" : "Réactiver"}
    </Button>
  );
}
