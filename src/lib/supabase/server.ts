import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Client Supabase lié à la session de l'utilisateur courant (RLS appliquée). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appel depuis un Server Component : les cookies seront rafraîchis
            // par le middleware.
          }
        },
      },
    }
  );
}

/** Utilisateur courant réduit à ce que l'application utilise réellement. */
export interface CurrentUser {
  id: string;
}

/**
 * Utilisateur courant, dédupliqué par requête (React cache).
 *
 * Vérification LOCALE du jeton via `getClaims()` : depuis le passage du projet
 * Supabase aux clés de signature asymétriques (ECC P-256), la signature se
 * contrôle avec le JWKS public, mis en cache par le processus. Plus d'appel
 * réseau à l'API auth à chaque rendu — c'était un aller-retour complet par
 * page, avant même la première requête de données.
 *
 * `getClaims()` rafraîchit quand même le jeton expiré (et purge la session si
 * le compte a été banni entre-temps) : le flux d'authentification est
 * inchangé, seul le coût disparaît.
 */
export const getCachedUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  return id ? { id } : null;
});
