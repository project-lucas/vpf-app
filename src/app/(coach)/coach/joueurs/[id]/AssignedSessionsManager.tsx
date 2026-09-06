"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import {
  assignSession,
  removeAssignment,
  reorderAssignments,
  setAssignmentWeekday,
  setVisibleNote,
} from "@/app/actions/coach";
import { CATEGORIES, VISIBLE_NOTE_MAX_LENGTH, WEEKDAY_LABELS } from "@/lib/constants";
import { parisNow } from "@/lib/dates";
import { WeekdayPicker, WeekdaySelect, weekdaysLabel } from "@/components/coach/WeekdayPicker";
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
  // jours appliqués aux séances affectées depuis ce panneau (0035) — un ou
  // plusieurs, « chaque jour » pour une routine
  const [addDays, setAddDays] = useState<number[]>(() => [parisNow().isoWeekday]);

  const active = assignments.filter((a) => !a.removed_at);
  const removed = assignments.filter((a) => a.removed_at && a.completion);

  // Le programme se lit par jour : les séances d'avant 0035 restées sans jour
  // ouvrent la liste, elles sont invisibles pour le joueur tant qu'on ne les
  // a pas rangées.
  const dayGroups = [
    ...(active.some((a) => a.weekday === null)
      ? [{ day: null as number | null, label: "À replacer", items: active.filter((a) => a.weekday === null) }]
      : []),
    ...WEEKDAY_LABELS.map((label, i) => ({
      day: i + 1 as number | null,
      label,
      items: active.filter((a) => a.weekday === i + 1),
    })).filter((g) => g.items.length > 0),
  ];

  /** Échange une séance avec sa voisine du MÊME jour (l'ordre est global). */
  function move(assignmentId: string, delta: number) {
    const sameDay = active.filter(
      (a) => a.weekday === active.find((x) => x.id === assignmentId)?.weekday
    );
    const pos = sameDay.findIndex((a) => a.id === assignmentId);
    const neighbour = sameDay[pos + delta];
    if (!neighbour) return;

    const ids = active.map((a) => a.id);
    const from = ids.indexOf(assignmentId);
    const to = ids.indexOf(neighbour.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
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
      const result = await assignSession(sessionId, [playerId], addDays);
      setError(result.ok ? null : result.error);
      if (result.ok) {
        setAddOpen(false);
        router.refresh();
      }
    });
  }

  function changeDay(assignmentId: string, weekday: number) {
    startTransition(async () => {
      const result = await setAssignmentWeekday(assignmentId, playerId, weekday);
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
          /* Groupé par jour : c'est ainsi que le joueur lit son programme */
          <div className="space-y-4">
            {dayGroups.map((group) => (
              <section key={group.label}>
                <h3
                  className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${
                    group.day === null ? "text-warning" : "text-navy-400"
                  }`}
                >
                  {group.label}
                  {group.day === null && " — invisible pour le joueur tant qu'aucun jour n'est choisi"}
                </h3>
                <div className="space-y-2">
                  {group.items.map((a, i) => (
                    <div key={a.id} className="rounded-xl border border-navy-100 p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            onClick={() => move(a.id, -1)}
                            disabled={isPending || i === 0}
                            aria-label="Monter"
                            className="text-navy-300 hover:text-navy-700 disabled:opacity-30"
                          >
                            <ChevronUpIcon size={16} />
                          </button>
                          <button
                            onClick={() => move(a.id, 1)}
                            disabled={isPending || i === group.items.length - 1}
                            aria-label="Descendre"
                            className="text-navy-300 hover:text-navy-700 disabled:opacity-30"
                          >
                            <ChevronDownIcon size={16} />
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-navy-900">
                            {a.session.name}
                          </p>
                          <p className="text-xs text-navy-400">
                            {(a.session.categories ?? []).join(", ")} · {a.session.duration_minutes}{" "}
                            min
                          </p>
                        </div>
                        <WeekdaySelect
                          value={a.weekday}
                          onChange={(day) => changeDay(a.id, day)}
                          disabled={isPending}
                        />
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
              </section>
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
            {/* Les jours se choisissent AVANT la séance : ils conditionnent
                l'endroit où le joueur la trouvera dans son programme. Un jour
                = une affectation = un pointage. */}
            <div className="rounded-xl bg-navy-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-500">
                Jours de la séance
              </p>
              <WeekdayPicker value={addDays} onChange={setAddDays} disabled={isPending} />
              <p className="mt-2 text-xs text-navy-400">
                {addDays.length === 0
                  ? "Choisis au moins un jour."
                  : `Le joueur la verra ${weekdaysLabel(addDays)} dans son programme, et la cochera chaque fois.`}
              </p>
            </div>

            {CATEGORIES[pole]
              .filter((c) => library.some((s) => (s.categories ?? []).includes(c)))
              .map((category) => (
                <div key={category}>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
                    {category}
                  </h3>
                  <div className="space-y-1.5">
                    {library
                      .filter((s) => (s.categories ?? []).includes(category))
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
