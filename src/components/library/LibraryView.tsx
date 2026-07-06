"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Timer, Wrench } from "lucide-react";
import { setSessionVisibility } from "@/app/actions/coach";
import { deleteLibrarySession } from "@/app/actions/admin";
import { CATEGORIES, POLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { SessionFormModal } from "./SessionFormModal";
import type { LibrarySession, SessionPole } from "@/lib/types";

export interface AssignablePlayer {
  id: string;
  name: string;
}

interface Props {
  sessions: LibrarySession[];
  players: AssignablePlayer[];
  /** séance → joueurs qui la voient actuellement */
  visibility: Record<string, string[]>;
  editable: boolean;
}

export function LibraryView({ sessions, players, visibility, editable }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pole, setPole] = useState<SessionPole>("basket");
  const [videoOpen, setVideoOpen] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<LibrarySession | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [assignMessage, setAssignMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [formTarget, setFormTarget] = useState<LibrarySession | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibrarySession | null>(null);

  const poleSessions = sessions.filter((s) => s.pole === pole);

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function confirmAssign() {
    if (!assignTarget) return;
    startTransition(async () => {
      const result = await setSessionVisibility(
        assignTarget.id,
        selectedPlayers,
        players.map((p) => p.id)
      );
      if (result.ok) {
        setAssignMessage({ ok: true, text: "Visibilité enregistrée" });
        setTimeout(() => {
          setAssignTarget(null);
          setAssignMessage(null);
        }, 900);
        router.refresh();
      } else {
        setAssignMessage({ ok: false, text: result.error });
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteLibrarySession(deleteTarget.id);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {(Object.keys(POLE_LABELS) as SessionPole[]).map((p) => (
          <button
            key={p}
            onClick={() => setPole(p)}
            className={`flex-1 rounded-xl px-1 py-2 text-[13px] font-bold transition-colors ${
              pole === p ? "bg-navy-800 text-white" : "border border-navy-200 bg-white text-navy-500"
            }`}
          >
            {/* onglets compacts : le libellé complet est côté joueur */}
            {p === "physique" ? "Physique" : p === "basket" ? "Technique" : POLE_LABELS[p]}
          </button>
        ))}
      </div>

      {editable && (
        <Button full className="mb-4" onClick={() => setFormTarget("new")}>
          <PlusIcon size={16} /> Nouvelle séance
        </Button>
      )}

      {poleSessions.length === 0 ? (
        <EmptyState>Aucune séance dans ce pôle pour le moment.</EmptyState>
      ) : (
        <div className="space-y-5">
          {CATEGORIES[pole]
            .filter((c) => poleSessions.some((s) => s.category === c))
            .map((category) => (
              <section key={category}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy-500">
                  {category}
                </h2>
                <div className="space-y-2.5">
                  {poleSessions
                    .filter((s) => s.category === category)
                    .map((s) => (
                      <Card key={s.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-bold text-navy-900">{s.name}</h3>
                            <p className="mt-0.5 text-xs text-navy-400">
                              <Timer size={12} className="-mt-0.5 inline" /> {s.duration_minutes}{" "}
                              min
                              {s.equipment && (
                                <>
                                  {" · "}
                                  <Wrench size={12} className="-mt-0.5 inline" /> {s.equipment}
                                </>
                              )}
                            </p>
                            {(s.positions ?? []).length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {(s.positions ?? []).map((p) => (
                                  <span
                                    key={p}
                                    className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold text-navy-500"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {editable && (
                            <div className="flex shrink-0 gap-1">
                              <button
                                onClick={() => setFormTarget(s)}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-navy-500 hover:bg-navy-50"
                              >
                                Modifier
                              </button>
                              <IconButton
                                tone="danger"
                                onClick={() => setDeleteTarget(s)}
                                aria-label="Supprimer"
                              >
                                <TrashIcon size={15} />
                              </IconButton>
                            </div>
                          )}
                        </div>

                        {videoOpen === s.id && (
                          <div className="mt-3">
                            <YouTubeEmbed url={s.youtube_url} title={s.name} />
                          </div>
                        )}

                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setVideoOpen(videoOpen === s.id ? null : s.id)}
                          >
                            {videoOpen === s.id ? "Masquer la vidéo" : "Voir la vidéo"}
                          </Button>
                          {players.length > 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setAssignTarget(s);
                                setSelectedPlayers(visibility[s.id] ?? []);
                                setAssignMessage(null);
                              }}
                            >
                              <Eye size={14} /> Visibilité
                              {(visibility[s.id]?.length ?? 0) > 0 && (
                                <span className="ml-0.5 rounded-full bg-navy-800 px-1.5 py-px text-[10px] font-bold text-white">
                                  {visibility[s.id].length}
                                </span>
                              )}
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                </div>
              </section>
            ))}
        </div>
      )}

      {/* Modal de visibilité : coche = le joueur voit la séance */}
      <Modal
        open={assignTarget !== null}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Visibilité « ${assignTarget.name} »` : ""}
      >
        <p className="mb-3 text-sm text-navy-500">
          Coche les joueurs qui verront cette séance dans leur espace.
        </p>
        <div className="space-y-1.5">
          {players.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 px-3.5 py-2.5"
            >
              <input
                type="checkbox"
                checked={selectedPlayers.includes(p.id)}
                onChange={() => togglePlayer(p.id)}
                className="h-4.5 w-4.5 accent-navy-800"
              />
              <span className="text-sm font-semibold text-navy-800">{p.name}</span>
            </label>
          ))}
        </div>
        {assignMessage && (
          <p
            className={`mt-3 flex items-center gap-1 text-sm font-semibold ${
              assignMessage.ok ? "text-success" : "text-danger"
            }`}
          >
            {assignMessage.ok && <Check size={14} />}
            {assignMessage.text}
          </p>
        )}
        <Button full className="mt-4" onClick={confirmAssign} disabled={isPending}>
          Enregistrer ({selectedPlayers.length} joueur{selectedPlayers.length > 1 ? "s" : ""})
        </Button>
      </Modal>

      {/* Modal création / édition (admin) */}
      {editable && formTarget !== null && (
        <SessionFormModal
          session={formTarget === "new" ? null : formTarget}
          defaultPole={pole}
          onClose={() => setFormTarget(null)}
        />
      )}

      {/* Confirmation de suppression (admin) */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer cette séance ?"
      >
        <p className="text-sm text-navy-500">
          « {deleteTarget?.name} » sera supprimée de la bibliothèque et retirée de tous les joueurs
          auxquels elle est affectée. Cette action est définitive.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button variant="danger" full onClick={confirmDelete} disabled={isPending}>
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
