import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PLAYER_HOME = "/planning";
const COACH_HOME = "/coach";
const ADMIN_HOME = "/admin";

const PLAYER_PREFIXES = [
  "/planning",
  "/dashboard",
  "/seances",
  "/basket",
  "/physique",
  "/habitudes",
  "/parametres",
];

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, players!players_id_fkey(status, onboarding_completed)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return redirect("/login");
  }

  const role = profile.role as "admin" | "coach" | "player";

  if (role === "player") {
    const player = Array.isArray(profile.players) ? profile.players[0] : profile.players;
    if (!player || player.status === "archived") {
      await supabase.auth.signOut();
      return redirect("/login");
    }
    if (!player.onboarding_completed) {
      return path === "/onboarding" ? response : redirect("/onboarding");
    }
    const isPlayerPath = PLAYER_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
    return isPlayerPath ? response : redirect(PLAYER_HOME);
  }

  if (role === "coach") {
    return path.startsWith("/coach") ? response : redirect(COACH_HOME);
  }

  // admin
  return path.startsWith("/admin") ? response : redirect(ADMIN_HOME);
}

export const config = {
  matcher: [
    // tout sauf les assets statiques, les fichiers PWA et les routes API
    "/((?!_next/static|_next/image|favicon.ico|api/|sw.js|manifest.webmanifest|icons/|.*\\.(?:png|svg|jpg|jpeg|ico|webp)).*)",
  ],
};
