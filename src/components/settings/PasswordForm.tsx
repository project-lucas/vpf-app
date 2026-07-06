"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EdButton, EdField, EdInput } from "@/components/editorial/forms";
import { CheckIcon } from "@/components/icons";

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ ok: false, text: "8 caractères minimum." });
      return;
    }
    if (password !== confirm) {
      setMessage({ ok: false, text: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMessage({
        ok: false,
        text: error.message.includes("different")
          ? "Le nouveau mot de passe doit être différent de l'ancien."
          : "Changement impossible. Reconnecte-toi puis réessaie.",
      });
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage({ ok: true, text: "Mot de passe modifié" });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <EdField label="Nouveau">
          <EdInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </EdField>
        <EdField label="Confirmer">
          <EdInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </EdField>
      </div>
      {message && (
        <p
          className={`ed-meta flex items-center gap-1.5 text-[11px] ${
            message.ok ? "text-ink" : "text-orange"
          }`}
        >
          {message.ok && <CheckIcon size={14} />}
          {message.text}
        </p>
      )}
      <EdButton type="submit" variant="ghost" full disabled={loading || !password}>
        {loading ? "Modification…" : "Mettre à jour"}
      </EdButton>
    </form>
  );
}
