"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, HeartPulse, Pencil, Plus, Trash2, Users } from "lucide-react";
import {
  createHygieneVideo,
  deleteHygieneVideo,
  setHygieneVideoVisibility,
  updateHygieneVideo,
  type HygieneVideoInput,
} from "@/app/actions/hygiene";
import { HYGIENE_VIDEO_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { HygieneVideo } from "@/lib/types";

const EMPTY_FORM: HygieneVideoInput = {
  title: "",
  url: "",
  category: HYGIENE_VIDEO_CATEGORIES[0],
  description: "",
};

function VideoForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial: HygieneVideoInput;
  submitLabel: string;
  onSubmit: (data: HygieneVideoInput) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial);
  const inputClass =
    "w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none";

  return (
    <div className="space-y-2.5">
      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value.slice(0, 120) })}
        placeholder="Titre — ex. Bien dormir avant un match"
        className={inputClass}
      />
      <input
        value={form.url}
        onChange={(e) => setForm({ ...form, url: e.target.value.slice(0, 500) })}
        placeholder="Lien de la vidéo — https://…"
        inputMode="url"
        className={inputClass}
      />
      <div className="flex flex-wrap gap-1.5">
        {HYGIENE_VIDEO_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setForm({ ...form, category: cat })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              form.category === cat
                ? "bg-navy-800 text-white"
                : "bg-navy-50 text-navy-500 hover:bg-navy-100"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
        placeholder="Consigne pour le joueur — ex. À regarder puis appliquer cette semaine."
        rows={2}
        className={inputClass}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onSubmit(form)} loading={isPending} disabled={!form.title.trim() || !form.url.trim()}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

/**
 * Vidéothèque « Hygiène de vie » de la Bibliothèque : les admins créent les
 * vidéos (URL + catégorie + consigne), coachs et admins activent la visibilité
 * joueur par joueur — uniquement les joueurs de l'offre formation, seuls à
 * porter l'onglet Hygiène de vie.
 */
export function HygieneVideoLibrary({
  videos,
  players,
  visibility,
  isAdmin,
}: {
  videos: HygieneVideo[];
  /** joueurs actifs de l'offre formation gérés par l'utilisateur courant */
  players: { id: string; name: string }[];
  /** vidéo → joueurs (gérés) qui la voient */
  visibility: Record<string, string[]>;
  isAdmin: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const managedIds = players.map((p) => p.id);

  function checkedFor(videoId: string): Set<string> {
    return checked[videoId] ?? new Set(visibility[videoId] ?? []);
  }

  function toggle(videoId: string, playerId: string) {
    const next = new Set(checkedFor(videoId));
    if (next.has(playerId)) next.delete(playerId);
    else next.add(playerId);
    setChecked((c) => ({ ...c, [videoId]: next }));
  }

  function saveVisibility(videoId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setHygieneVideoVisibility(videoId, [...checkedFor(videoId)], managedIds);
      if (!result.ok) setError(result.error);
      else setOpenVideoId(null);
    });
  }

  function create(data: HygieneVideoInput) {
    setError(null);
    startTransition(async () => {
      const result = await createHygieneVideo(data);
      if (!result.ok) setError(result.error);
      else setCreating(false);
    });
  }

  function update(videoId: string, data: HygieneVideoInput) {
    setError(null);
    startTransition(async () => {
      const result = await updateHygieneVideo(videoId, data);
      if (!result.ok) setError(result.error);
      else setEditingId(null);
    });
  }

  function remove(videoId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteHygieneVideo(videoId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardTitle>
        <HeartPulse size={15} className="-mt-0.5 mr-1.5 inline" />
        Vidéos Hygiène de vie
      </CardTitle>
      <p className="mb-3 text-xs text-navy-400">
        {isAdmin
          ? "Crée les vidéos éducatives (sommeil, nutrition…) puis active-les joueur par joueur — le joueur les retrouve dans son onglet Hygiène de vie."
          : "Active les vidéos éducatives joueur par joueur : le joueur les retrouve dans son onglet Hygiène de vie (offre formation)."}
      </p>

      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="mb-4">
          {creating ? (
            <VideoForm
              initial={EMPTY_FORM}
              submitLabel="Ajouter la vidéo"
              onSubmit={create}
              onCancel={() => setCreating(false)}
              isPending={isPending}
            />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus size={14} /> Ajouter une vidéo
            </Button>
          )}
        </div>
      )}

      {videos.length === 0 ? (
        <p className="text-sm text-navy-400">
          {isAdmin ? "Aucune vidéo pour le moment." : "Les admins n'ont pas encore ajouté de vidéo."}
        </p>
      ) : (
        <div className="divide-y divide-navy-50">
          {videos.map((v) => {
            const visibleCount = checkedFor(v.id).size;
            const isOpen = openVideoId === v.id;
            return (
              <div key={v.id} className="py-3">
                {editingId === v.id ? (
                  <VideoForm
                    initial={{
                      title: v.title,
                      url: v.url,
                      category: v.category,
                      description: v.description,
                    }}
                    submitLabel="Enregistrer"
                    onSubmit={(data) => update(v.id, data)}
                    onCancel={() => setEditingId(null)}
                    isPending={isPending}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-800">
                          {v.title}
                          {v.category && (
                            <Badge tone="navy" className="ml-1.5 align-middle">
                              {v.category}
                            </Badge>
                          )}
                        </p>
                        {v.description && (
                          <p className="mt-0.5 text-xs text-navy-500">{v.description}</p>
                        )}
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-navy-400 underline hover:text-navy-600"
                        >
                          <ExternalLink size={11} /> Voir la vidéo
                        </a>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingId(v.id)}
                            aria-label={`Modifier « ${v.title} »`}
                            className="rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-navy-50 hover:text-navy-600"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(v.id)}
                            disabled={isPending}
                            aria-label={`Supprimer « ${v.title} »`}
                            className="rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setOpenVideoId(isOpen ? null : v.id)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-800"
                    >
                      <Users size={13} />
                      Visible par {visibleCount} joueur{visibleCount > 1 ? "s" : ""}
                      <ChevronDown
                        size={13}
                        className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isOpen && (
                      <div className="mt-2 rounded-xl bg-navy-50 p-3">
                        {players.length === 0 ? (
                          <p className="text-xs text-navy-400">
                            Aucun joueur en offre formation dans ton effectif.
                          </p>
                        ) : (
                          <>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {players.map((p) => (
                                <label
                                  key={p.id}
                                  className="flex cursor-pointer items-center gap-2 text-sm text-navy-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checkedFor(v.id).has(p.id)}
                                    onChange={() => toggle(v.id, p.id)}
                                    className="h-4 w-4 accent-navy-800"
                                  />
                                  {p.name}
                                </label>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              className="mt-2.5"
                              onClick={() => saveVisibility(v.id)}
                              loading={isPending}
                            >
                              Enregistrer la visibilité
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
