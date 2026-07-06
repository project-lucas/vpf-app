"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLibrarySession, updateLibrarySession } from "@/app/actions/admin";
import { CATEGORIES, POLE_LABELS, POSITIONS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { LibrarySession, SessionPole } from "@/lib/types";

export function SessionFormModal({
  session,
  defaultPole,
  onClose,
}: {
  session: LibrarySession | null;
  defaultPole: SessionPole;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pole, setPole] = useState<SessionPole>(session?.pole ?? defaultPole);
  const [category, setCategory] = useState(session?.category ?? CATEGORIES[defaultPole][0]);
  const [positions, setPositions] = useState<string[]>(session?.positions ?? []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function togglePosition(p: string) {
    setPositions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function changePole(next: SessionPole) {
    setPole(next);
    setCategory(CATEGORIES[next][0]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get("name") ?? ""),
      pole,
      category,
      youtube_url: String(fd.get("youtube_url") ?? ""),
      duration_minutes: Number(fd.get("duration_minutes")),
      equipment: String(fd.get("equipment") ?? ""),
      positions,
    };
    const result = session
      ? await updateLibrarySession(session.id, data)
      : await createLibrarySession(data);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={session ? "Modifier la séance" : "Nouvelle séance"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nom de la séance">
          <Input name="name" required defaultValue={session?.name ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pôle">
            <Select value={pole} onChange={(e) => changePole(e.target.value as SessionPole)}>
              {(Object.keys(POLE_LABELS) as SessionPole[]).map((p) => (
                <option key={p} value={p}>
                  {POLE_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Catégorie">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES[pole].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="URL YouTube (non répertoriée)">
          <Input
            name="youtube_url"
            type="url"
            placeholder="https://youtu.be/…"
            defaultValue={session?.youtube_url ?? ""}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durée (min)">
            <Input
              name="duration_minutes"
              type="number"
              min={1}
              max={240}
              required
              defaultValue={session?.duration_minutes ?? 30}
            />
          </Field>
          <Field label="Matériel">
            <Input
              name="equipment"
              placeholder="Ballon, plots…"
              defaultValue={session?.equipment ?? ""}
            />
          </Field>
        </div>
        <Field label="Postes concernés (aucun coché = tous les postes)">
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePosition(p)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  positions.includes(p)
                    ? "bg-navy-800 text-white"
                    : "border border-navy-200 bg-white text-navy-500 hover:bg-navy-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" full disabled={loading}>
          {loading ? "Enregistrement…" : session ? "Enregistrer" : "Créer la séance"}
        </Button>
      </form>
    </Modal>
  );
}
