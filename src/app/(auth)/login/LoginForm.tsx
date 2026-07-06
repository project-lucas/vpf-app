"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setLoading(false);
      setError(
        error.message.includes("Invalid login")
          ? "Email ou mot de passe incorrect."
          : error.message.includes("banned") || error.status === 403
            ? "Ton accès est désactivé. Contacte VPF."
            : "Connexion impossible. Réessaie."
      );
      return;
    }
    // rechargement complet : le middleware redirige vers l'accueil du rôle
    window.location.href = "/";
  }

  async function handleForgotPassword() {
    setError("");
    setNotice("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Saisis ton email ci-dessus, puis clique à nouveau sur « Mot de passe oublié ».");
      return;
    }
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: window.location.origin,
    });
    // message neutre volontairement (ne révèle pas si le compte existe)
    setNotice("Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Email">
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ton@email.fr"
        />
      </Field>
      <Field label="Mot de passe">
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-navy-400 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40 rounded-r-xl"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </Field>

      <div className="text-right">
        <button
          type="button"
          onClick={handleForgotPassword}
          className="text-sm font-semibold text-navy-500 hover:text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40 rounded"
        >
          Mot de passe oublié ?
        </button>
      </div>

      {error && <FormError>{error}</FormError>}
      {notice && (
        <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      )}
      <Button type="submit" size="lg" full loading={loading}>
        {loading ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
