"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCoach } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function DeleteCoachButton({
  coachId,
  coachName,
  playerCount,
}: {
  coachId: string;
  coachName: string;
  playerCount: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function confirmDelete() {
    setError("");
    setLoading(true);
    const result = await deleteCoach(coachId);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push("/coach/club");
  }

  return (
    <>
      <Button
        size="sm"
        variant="danger"
        className="mt-1 shrink-0"
        onClick={() => {
          setError("");
          setConfirmOpen(true);
        }}
      >
        Supprimer
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Supprimer ${coachName} ?`}
      >
        <ul className="list-inside list-disc space-y-1 text-sm text-navy-500">
          <li>
            <span className="font-semibold text-danger">
              Son compte est définitivement supprimé.
            </span>{" "}
            Cette action est irréversible.
          </li>
          <li>
            {playerCount === 0
              ? "Il n'a aucun joueur rattaché."
              : `Ses ${playerCount} joueur${playerCount > 1 ? "s" : ""} (actifs et archivés) te seront réassignés.`}
          </li>
          <li>Ses invitations en attente sont supprimées.</li>
        </ul>
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full onClick={() => setConfirmOpen(false)} disabled={loading}>
            Annuler
          </Button>
          <Button variant="danger" full onClick={confirmDelete} disabled={loading}>
            {loading ? "Suppression…" : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
