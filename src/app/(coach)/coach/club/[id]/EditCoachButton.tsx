"use client";

import { useState } from "react";
import { updateCoach } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

export interface EditableCoach {
  id: string;
  first_name: string;
  last_name: string;
  whatsapp_number: string;
}

export function EditCoachButton({ coach }: { coach: EditableCoach }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const result = await updateCoach(coach.id, {
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
    setOpen(false);
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="mt-1 shrink-0"
        onClick={() => { setOpen(true); setError(""); }}
      >
        Modifier
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Modifier le coach">
        <form onSubmit={handleEdit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom">
              <Input name="first_name" required defaultValue={coach.first_name} />
            </Field>
            <Field label="Nom">
              <Input name="last_name" required defaultValue={coach.last_name} />
            </Field>
          </div>
          <Field label="Numéro WhatsApp">
            <Input name="whatsapp_number" type="tel" defaultValue={coach.whatsapp_number} />
          </Field>
          <Field label="Nouveau mot de passe (laisser vide pour ne pas changer)">
            <Input name="password" type="text" autoComplete="off" />
          </Field>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" full disabled={loading}>
            {loading ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
