"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCoachNote, deleteCoachNote } from "@/app/actions/coach";
import { formatDateFr } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { TrashIcon } from "@/components/icons";
import type { CoachNote } from "@/lib/types";

export function CoachNotesPanel({ playerId, notes }: { playerId: string; notes: CoachNote[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoachNote | null>(null);

  function add() {
    if (!content.trim()) return;
    startTransition(async () => {
      const result = await addCoachNote(playerId, content);
      setError(result.ok ? null : result.error);
      if (result.ok) {
        setContent("");
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteCoachNote(deleteTarget.id, playerId);
      setError(result.ok ? null : result.error);
      setDeleteTarget(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardTitle>Notes privées</CardTitle>
      <p className="mb-3 text-xs text-navy-400">
        Visibles uniquement par toi et l&apos;admin VPF. Supprimées si le joueur est archivé.
      </p>
      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Nouvelle note…"
          rows={3}
          className="w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
        />
        <Button full variant="secondary" onClick={add} disabled={isPending || !content.trim()}>
          Ajouter la note
        </Button>
      </div>

      {notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl bg-navy-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-navy-800">{n.content}</p>
                <IconButton
                  tone="danger"
                  onClick={() => setDeleteTarget(n)}
                  disabled={isPending}
                  aria-label="Supprimer la note"
                  className="shrink-0"
                >
                  <TrashIcon size={15} />
                </IconButton>
              </div>
              <p className="mt-1 text-[11px] text-navy-400">
                {formatDateFr(n.created_at.slice(0, 10))}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation de suppression */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer cette note ?"
      >
        <p className="whitespace-pre-wrap text-sm text-navy-500">{deleteTarget?.content}</p>
        <p className="mt-2 text-xs text-navy-400">Cette action est définitive.</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button variant="danger" full onClick={confirmDelete} disabled={isPending}>
            Supprimer
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
