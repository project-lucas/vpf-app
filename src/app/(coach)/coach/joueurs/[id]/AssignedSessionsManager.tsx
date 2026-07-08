"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import {
  assignSession,
  removeAssignment,
  reorderAssignments,
  setVisibleNote,
} from "@/app/actions/coach";
import { CATEGORIES, VISIBLE_NOTE_MAX_LENGTH } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import type { LibrarySession, SessionAssignmentWithSession, SessionPole } from "@/lib/types";

interface Props {
  playerId: string;
  pole: SessionPole;
  assignments: SessionAssignmentWithSession[];
  library: LibrarySession[];
  visibleNote: string;
}

export function AssignedSessionsManager({
  playerId,
  pole,
  assignments,
  library,
  visibleNote,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [note, setNote] = useState(visibleNote);
  const [noteSaved, setNoteSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = assignments.filter((a) => !a.removed_at);
  const removed = assignments.filter((a) => a.removed_at && a.completion);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= active.length) return;
    const ids = active.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      const result = await reorderAssignments(playerId, ids);
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  function remove(assignmentId: string) {
    startTransition(async () => {
      const result = await removeAssignment(assignmentId, playerId);
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  function add(sessionId: string) {
    startTransition(async () => {
      const result = await assignSession(sessionId, [playerId]);
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  function saveNote() {
    startTransition(async () => {
      const result = await setVisibleNote(playerId, pole, note);
      setError(result.ok ? null : result.error);
      if (result.ok) {
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 2000);
        router.refresh();
      }
    });
  }

  const completionBadge = (a: SessionAssignmentWithSession) =>
    !a.completion ? (
      <Badge tone="neutral">En attente</Badge>
    ) : a.completion.status === "done" ? (
      <span className="flex shrink-0 items-center gap-1">
        {a.completion.challenge_score !== null && (
          <Badge tone="navy">Challenge {a.completion.challenge_score}</Badge>
        )}
        <Badge tone="success">Faite</Badge>
      </span>
    ) : (
      <Badge tone="danger">Pas faite</Badge>
    );

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {/* Note visible par le joueur */}
      <Card>
        <CardTitle>Note visible par le joueur</CardTitle>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, VISIBLE_NOTE_MAX_LENGTH))}
          placeholder="Ex. : focus sur la main gauche cette semaine"
          className="w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-navy-300">
            {note.length}/{VISIBLE_NOTE_MAX_LENGTH}
          </span>
          <div className="flex items-center gap-2">
            {noteSaved && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                <Check size={12} /> Enregistré
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={saveNote} disabled={isPending}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Card>

      {/* Séances affectées */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="mb-0">Séances affectées</CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon size={14} /> Affecter
          </Button>
        </div>

        {active.length === 0 ? (
          <p className="text-sm text-navy-400">Aucune séance affectée.</p>
        ) : (
          <div className="space-y-2">
            {active.map((a, i) => (
              <div key={a.id} className="rounded-xl border border-navy-100 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={isPending || i === 0}
                      aria-label="Monter"
                      className="text-navy-300 hover:text-navy-700 disabled:opacity-30"
                    >
                      <ChevronUpIcon size={16} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={isPending || i === active.length - 1}
                      aria-label="Descendre"
                      className="text-navy-300 hover:text-navy-700 disabled:opacity-30"
                    >
                      <ChevronDownIcon size={16} />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-900">{a.session.name}</p>
                    <p className="text-xs text-navy-400">
                      {a.session.category} · {a.session.duration_minutes} min
                    </p>
                  </div>
                  {completionBadge(a)}
                  <IconButton
                    tone="danger"
                    onClick={() => remove(a.id)}
                    disabled={isPending}
                    aria-label="Retirer"
                  >
                    <TrashIcon size={16} />
                  </IconButton>
                </div>
                {a.completion?.comment && (
                  <p className="mt-1.5 flex items-start gap-1.5 border-t border-navy-50 pt-1.5 text-xs text-navy-500">
                    <MessageCircle size={13} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">{a.completion.comment}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Historique des séances retirées */}
      {removed.length > 0 && (
        <Card>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex w-full items-center justify-between text-sm font-bold text-navy-500"
          >
            Historique des séances retirées ({removed.length})
            {showHistory ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {removed.map((a) => (
                <div key={a.id} className="rounded-xl bg-navy-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-navy-700">{a.session.name}</p>
                    {completionBadge(a)}
                  </div>
                  {a.completion?.comment && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-navy-500">
                      <MessageCircle size={13} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">{a.completion.comment}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal d'affectation depuis la bibliothèque */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Affecter une séance">
        {library.length === 0 ? (
          <p className="text-sm text-navy-400">La bibliothèque est vide pour ce pôle.</p>
        ) : (
          <div className="space-y-4">
            {CATEGORIES[pole]
              .filter((c) => library.some((s) => s.category === c))
              .map((category) => (
                <div key={category}>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
                    {category}
                  </h3>
                  <div className="space-y-1.5">
                    {library
                      .filter((s) => s.category === category)
                      .map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-navy-100 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-navy-800">
                              {s.name}
                            </p>
                            <p className="text-xs text-navy-400">{s.duration_minutes} min</p>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => add(s.id)} disabled={isPending}>
                            Ajouter
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
