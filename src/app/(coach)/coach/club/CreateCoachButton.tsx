"use client";

import { useState } from "react";
import { createCoach } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon } from "@/components/icons";

export function CreateCoachButton() {
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  }

  return (
    <>
      <Button full onClick={() => { setOpen(true); setError(""); }}>
        <PlusIcon size={16} /> Créer un coach
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Créer un coach">
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
    </>
  );
}
