"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCoach, updateCoach } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon } from "@/components/icons";

export interface CoachWithPlayers {
  id: string;
  first_name: string;
  last_name: string;
  whatsapp_number: string;
  players: { id: string; name: string; status: "active" | "archived" }[];
}

export function CoachsManager({ coachs }: { coachs: CoachWithPlayers[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CoachWithPlayers | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const result = await createCoach({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      first_name: String(fd.get("first_name") ?? ""),
      last_name: String(fd.get("last_name") ?? ""),
      whatsapp_number: String(fd.get("whatsapp_number") ?? ""),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreateOpen(false);
    router.refresh();
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTarget) return;
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const result = await updateCoach(editTarget.id, {
      first_name: String(fd.get("first_name") ?? ""),
      last_name: String(fd.get("last_name") ?? ""),
      whatsapp_number: String(fd.get("whatsapp_number") ?? ""),
      ...(password ? { password } : {}),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditTarget(null);
    router.refresh();
  }

  return (
    <div>
      <Button full className="mb-4" onClick={() => { setCreateOpen(true); setError(""); }}>
        <PlusIcon size={16} /> Créer un coach
      </Button>

      <div className="space-y-3">
        {coachs.map((coach) => {
          const activePlayers = coach.players.filter((p) => p.status === "active");
          return (
            <Card key={coach.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-navy-900">
                    {coach.first_name} {coach.last_name}
                  </p>
                  {coach.whatsapp_number && (
                    <p className="text-xs text-navy-400">WhatsApp : {coach.whatsapp_number}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setEditTarget(coach); setError(""); }}
                >
                  Modifier
                </Button>
              </div>
              <div className="mt-3 border-t border-navy-50 pt-2.5">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
                  {activePlayers.length} joueur(s) actif(s)
                </p>
                {coach.players.length === 0 ? (
                  <p className="text-sm text-navy-300">Aucun joueur associé.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {coach.players.map((p) => (
                      <Badge key={p.id} tone={p.status === "active" ? "neutral" : "warning"}>
                        {p.name}
                        {p.status === "archived" && " (archivé)"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Création */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un coach">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom">
              <Input name="first_name" required />
            </Field>
            <Field label="Nom">
              <Input name="last_name" required />
            </Field>
          </div>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Mot de passe (8 caractères min.)">
            <Input name="password" type="text" required minLength={8} autoComplete="off" />
          </Field>
          <Field label="Numéro WhatsApp">
            <Input name="whatsapp_number" type="tel" placeholder="+33 6 12 34 56 78" />
          </Field>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" full disabled={loading}>
            {loading ? "Création…" : "Créer le coach"}
          </Button>
        </form>
      </Modal>

      {/* Édition */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Modifier le coach"
      >
        {editTarget && (
          <form onSubmit={handleEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom">
                <Input name="first_name" required defaultValue={editTarget.first_name} />
              </Field>
              <Field label="Nom">
                <Input name="last_name" required defaultValue={editTarget.last_name} />
              </Field>
            </div>
            <Field label="Numéro WhatsApp">
              <Input
                name="whatsapp_number"
                type="tel"
                defaultValue={editTarget.whatsapp_number}
              />
            </Field>
            <Field label="Nouveau mot de passe (laisser vide pour ne pas changer)">
              <Input name="password" type="text" autoComplete="off" />
            </Field>
            {error && <p className="text-sm font-medium text-danger">{error}</p>}
            <Button type="submit" full disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
