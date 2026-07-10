import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PLAYER_HOME = "/planning";
const COACH_HOME = "/coach";

const PLAYER_PREFIXES = [
  "/planning",
  "/dashboard",
  "/seances",
  "/basket",
  "/physique",
  "/habitudes",
  "/parametres",
];

// Cache court du rôle dans un cookie httpOnly : évite la requête `profiles`
// à CHAQUE navigation (le middleware est sur le chemin critique de toutes les
// pages). Lié à l'id utilisateur ; seuls les états stables sont mis en cache
// (coach/admin, joueur actif et onboardé) — les états transitoires
// (onboarding, archivage) re-vérifient la base à chaque requête.
const NAV_COOKIE = "vpf-nav";
const NAV_TTL_SECONDS = 15 * 60;

type NavState = { role: "admin" | "coach" | "player" };

function parseNavCookie(value: string | undefined, userId: string): NavState | null {
  if (!value) return null;
  const [uid, role] = value.split("|");
  if (uid !== userId) return null;
  if (role !== "admin" && role !== "coach" && role !== "player") return null;
  return { role };
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // page de repli hors-ligne : accessible sans session (servie par le SW)
  if (request.nextUrl.pathname === "/offline") return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/invitation");

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const r = NextResponse.redirect(url);
    // conserve les cookies de session éventuellement rafraîchis
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user) {
    return isPublic ? response : redirect("/login");
  }

  const cached = parseNavCookie(request.cookies.get(NAV_COOKIE)?.value, user.id);
  let role: "admin" | "coach" | "player";

  if (cached) {
    role = cached.role;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, players!players_id_fkey(status, onboarding_completed)")
      .eq("id", user.id)
      .single();

    if (!profile) {
      await supabase.auth.signOut();
      return redirect("/login");
    }

    role = profile.role as "admin" | "coach" | "player";

    if (role === "player") {
      const player = Array.isArray(profile.players) ? profile.players[0] : profile.players;
      if (!player || player.status === "archived") {
        await supabase.auth.signOut();
        return redirect("/login");
      }
      if (!player.onboarding_completed) {
        // état transitoire : pas de cache, pour que la fin de l'onboarding
        // soit prise en compte immédiatement
        return path === "/onboarding" ? response : redirect("/onboarding");
      }
    }

    response.cookies.set(NAV_COOKIE, `${user.id}|${role}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: NAV_TTL_SECONDS,
      path: "/",
    });
  }

  if (role === "player") {
    const isPlayerPath = PLAYER_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
    return isPlayerPath ? response : redirect(PLAYER_HOME);
  }

  // coach et admin partagent l'interface /coach ; l'onglet Club (supervision)
  // est réservé à l'admin, gardé côté page (le middleware ne distingue pas).
  return path.startsWith("/coach") ? response : redirect(COACH_HOME);
}

export const config = {
  matcher: [
    // tout sauf les assets statiques, les fichiers PWA et les routes API
    "/((?!_next/static|_next/image|favicon.ico|api/|sw.js|manifest.webmanifest|icons/|.*\\.(?:png|svg|jpg|jpeg|ico|webp)).*)",
  ],
};
