"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archivePlayer, reactivatePlayer } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

export interface ManagedPlayer {
  id: string;
  name: string;
  coachName: string;
  status: "active" | "archived";
}

export function ExclusionManager({ players }: { players: ManagedPlayer[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<ManagedPlayer | null>(null);

  const active = players.filter((p) => p.status === "active");
  const archived = players.filter((p) => p.status === "archived");

  function confirmArchive() {
    if (!confirmTarget) return;
    startTransition(async () => {
      await archivePlayer(confirmTarget.id);
      setConfirmTarget(null);
      router.refresh();
    });
  }

  function reactivate(playerId: string) {
    startTransition(async () => {
      await reactivatePlayer(playerId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <CardTitle>Joueurs actifs ({active.length})</CardTitle>
        <div className="space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-navy-400">Aucun joueur actif.</p>
          ) : (
            active.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-navy-900">{p.name}</p>
                  <p className="text-xs text-navy-400">Coach : {p.coachName}</p>
                </div>
                <Button size="sm" variant="danger" onClick={() => setConfirmTarget(p)}>
                  Archiver
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>

      <div>
        <CardTitle>Joueurs archivés ({archived.length})</CardTitle>
        <div className="space-y-2">
          {archived.length === 0 ? (
            <p className="text-sm text-navy-400">Aucun joueur archivé.</p>
          ) : (
            archived.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-navy-900">{p.name}</p>
                  <p className="text-xs text-navy-400">Coach : {p.coachName}</p>
                </div>
                <Button size="sm" variant="success" onClick={() => reactivate(p.id)} disabled={isPending}>
                  Réactiver
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>

      <Modal
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={`Archiver ${confirmTarget?.name} ?`}
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
          <Button variant="secondary" full onClick={() => setConfirmTarget(null)}>
            Annuler
          </Button>
          <Button variant="danger" full onClick={confirmArchive} disabled={isPending}>
            {isPending ? "Archivage…" : "Archiver"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
