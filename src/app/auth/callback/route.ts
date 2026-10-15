import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Retour du lien reçu par email (mot de passe oublié). Supabase renvoie ici
 * avec un `code` (flux PKCE : le navigateur qui a fait la demande garde la
 * clé de vérification en cookie) ou un `token_hash` (modèle d'email qui
 * pointe directement ici). Dans les deux cas on ouvre la session, puis on
 * envoie vers la page qui fait choisir le nouveau mot de passe.
 *
 * Avant, le lien ramenait à l'accueil avec un code que personne n'échangeait :
 * le joueur restait bloqué devant l'écran de connexion.
 */
const ALLOWED_NEXT = new Set(["/nouveau-mot-de-passe"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/nouveau-mot-de-passe";
  const target = ALLOWED_NEXT.has(next) ? next : "/nouveau-mot-de-passe";

  const supabase = await createClient();
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const redirect = request.nextUrl.clone();
  redirect.search = "";
  if (ok) {
    redirect.pathname = target;
  } else {
    // lien expiré, déjà utilisé, ou ouvert sur un autre appareil que la demande
    redirect.pathname = "/login";
    redirect.searchParams.set("lien", "expire");
  }
  return NextResponse.redirect(redirect);
}
