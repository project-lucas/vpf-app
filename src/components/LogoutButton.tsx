"use client";

import { createClient } from "@/lib/supabase/client";
import { EdButton } from "@/components/editorial/forms";

export function LogoutButton() {
  async function logout() {
    const supabase = createClient();
    // `scope: "local"` : on déconnecte CET appareil. Le défaut de supabase-js
    // est `global` — il révoque les jetons de tous les appareils, donc se
    // déconnecter du téléphone déconnectait aussi la tablette et l'ordinateur,
    // qui redemandaient email + mot de passe à la visite suivante.
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/login";
  }
  return (
    <EdButton variant="ghost" full onClick={logout}>
      Se déconnecter
    </EdButton>
  );
}
