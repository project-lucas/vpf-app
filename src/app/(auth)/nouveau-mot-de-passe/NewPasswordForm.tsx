"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";

const MIN_LENGTH = 8;

export function NewPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) return setError(`${MIN_LENGTH} caractères minimum.`);
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setError(
        error.message.includes("different")
          ? "Choisis un mot de passe différent de l'ancien."
          : error.message.toLowerCase().includes("session")
            ? "Le lien a expiré. Redemande un lien depuis l'écran de connexion."
            : "Changement impossible. Réessaie."
      );
      return;
    }
    // rechargement complet : le middleware envoie vers l'accueil du rôle
    window.location.href = "/";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nouveau mot de passe">
        <Input
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8 caractères minimum"
        />
      </Field>
      <Field label="Confirmer">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {error && <FormError>{error}</FormError>}
      <Button type="submit" size="lg" full loading={loading}>
        {loading ? "Enregistrement…" : "Enregistrer et entrer"}
      </Button>
    </form>
  );
}
