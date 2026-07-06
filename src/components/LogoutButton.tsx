"use client";

import { createClient } from "@/lib/supabase/client";
import { EdButton } from "@/components/editorial/forms";

export function LogoutButton() {
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return (
    <EdButton variant="ghost" full onClick={logout}>
      Se déconnecter
    </EdButton>
  );
}
