// Vérification de bout en bout : auth réelle, RLS, garde des rôles, pages SSR.
// Usage : node --env-file=.env.local scripts/verify.mjs   (dev server lancé sur :3000)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP = "http://localhost:3000";
const PASSWORD = "vpf-demo-2026";
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label} ${detail}`);
  }
}

async function signIn(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function rest(session, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

// Cookie de session au format @supabase/ssr ("base64-" + base64url, chunké si long)
function sessionCookie(session) {
  const value =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${REF}-auth-token`;
  const MAX = 3180;
  if (value.length <= MAX) return `${name}=${value}`;
  const chunks = [];
  for (let i = 0; i * MAX < value.length; i++) {
    chunks.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  }
  return chunks.join("; ");
}

async function page(session, path) {
  const res = await fetch(`${APP}${path}`, {
    redirect: "manual",
    headers: session ? { Cookie: sessionCookie(session) } : {},
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: res.status === 200 ? await res.text() : "",
  };
}

// ---------------------------------------------------------------------------
console.log("\n1. Connexions réelles (email + mot de passe)");
const lucas = await signIn("joueur.lucas@vpf.fr");
const emma = await signIn("joueur.emma@vpf.fr");
const karim = await signIn("coach.karim@vpf.fr");
const sarah = await signIn("coach.sarah@vpf.fr");
const admin = await signIn("admin@vpf.fr");
check("les 5 comptes se connectent", true);

console.log("\n2. RLS — joueur (Lucas, coach Karim)");
{
  const r = await rest(lucas, "players?select=id");
  check("ne voit qu'un seul joueur : lui-même", r.json?.length === 1, `(${r.json?.length})`);

  const r2 = await rest(lucas, "library_sessions?select=id,name");
  check(
    "bibliothèque : voit uniquement ses 2 séances affectées",
    r2.json?.length === 2,
    `(${r2.json?.length})`
  );

  const r3 = await rest(lucas, "coach_notes?select=id");
  check("notes privées coach : invisibles (0)", r3.json?.length === 0, `(${r3.json?.length})`);

  const r4 = await rest(lucas, `profiles?id=eq.${lucas.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });
  check("escalade de rôle bloquée (PATCH role=admin refusé)", r4.status === 401 || r4.status === 403, `(${r4.status})`);

  const r5 = await rest(lucas, `players?id=eq.${lucas.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ season_goal: "hack" }),
  });
  check(
    "modification de son propre profil joueur refusée",
    r5.status === 401 || r5.status === 403 || (Array.isArray(r5.json) && r5.json.length === 0),
    `(${r5.status})`
  );

  const stats = await rest(lucas, `match_stats?select=id&player_id=eq.${lucas.user.id}`);
  const r6 = await rest(lucas, `match_stats?id=eq.${stats.json?.[0]?.id}`, { method: "DELETE" });
  check(
    "suppression d'une stat match refusée",
    r6.status === 401 || r6.status === 403 || (Array.isArray(r6.json) && r6.json.length === 0),
    `(${r6.status})`
  );

  const r7 = await rest(lucas, `planned_events?select=id&player_id=eq.${emma.user.id}`);
  check("planning d'un autre joueur : invisible", r7.json?.length === 0, `(${r7.json?.length})`);
}

console.log("\n3. RLS — coachs");
{
  const rk = await rest(karim, "players?select=id");
  check("Karim voit exactement ses 3 joueurs", rk.json?.length === 3, `(${rk.json?.length})`);

  const rs = await rest(sarah, "players?select=id");
  check("Sarah voit exactement ses 2 joueurs", rs.json?.length === 2, `(${rs.json?.length})`);

  const cross = await rest(karim, `planned_events?select=id&player_id=eq.${emma.user.id}`);
  check(
    "Karim ne voit pas le planning d'Emma (joueuse de Sarah)",
    cross.json?.length === 0,
    `(${cross.json?.length})`
  );

  const crossNotes = await rest(karim, `coach_notes?select=id&player_id=eq.${emma.user.id}`);
  check("Karim ne voit pas les notes des joueurs de Sarah", crossNotes.json?.length === 0);

  const lib = await rest(karim, "library_sessions?select=id");
  check("coach : bibliothèque complète en lecture (4)", lib.json?.length === 4, `(${lib.json?.length})`);

  const libWrite = await rest(karim, "library_sessions", {
    method: "POST",
    body: JSON.stringify({ name: "x", pole: "basket", category: "Tir", duration_minutes: 10 }),
  });
  check("coach : création de séance refusée", libWrite.status === 401 || libWrite.status === 403, `(${libWrite.status})`);
}

console.log("\n4. RLS — admin");
{
  const ra = await rest(admin, "players?select=id");
  check("admin voit les 5 joueurs", ra.json?.length === 5, `(${ra.json?.length})`);
  const inv = await rest(admin, "invitations?select=id");
  check("admin voit les invitations", (inv.json?.length ?? 0) >= 1);
  const invLucas = await rest(lucas, "invitations?select=id");
  check("joueur ne voit aucune invitation", invLucas.json?.length === 0);
}

console.log("\n5. Garde des rôles (middleware) et rendu des pages");
{
  const p1 = await page(lucas, "/planning");
  check("joueur : /planning rend (200)", p1.status === 200 && p1.body.includes("Mon planning"));
  const p2 = await page(lucas, "/coach");
  check("joueur : /coach redirigé vers /planning", p2.status === 307 && p2.location?.includes("/planning"), `(${p2.status} -> ${p2.location})`);
  const p3 = await page(lucas, "/dashboard");
  check("joueur : /dashboard rend", p3.status === 200 && p3.body.includes("dashboard"));
  const p4 = await page(karim, "/coach");
  check("coach : /coach rend", p4.status === 200 && p4.body.includes("Dashboard"));
  const p5 = await page(karim, "/admin");
  check("coach : /admin redirigé vers /coach", p5.status === 307 && p5.location?.includes("/coach"), `(${p5.status} -> ${p5.location})`);
  const p6 = await page(admin, "/admin");
  check("admin : /admin rend", p6.status === 200);
  const p7 = await page(null, "/planning");
  check("non connecté : redirigé vers /login", p7.status === 307 && p7.location?.includes("/login"), `(${p7.status})`);
}

console.log("\n6. Habitudes (heatmap)");
{
  const rl = await rest(lucas, "habits?select=id,name");
  check("Lucas voit ses 2 habitudes", rl.json?.length === 2, `(${rl.json?.length})`);

  const rk = await rest(karim, `habits?select=id&player_id=eq.${lucas.user.id}`);
  check("coach référent : lecture des habitudes de Lucas", rk.json?.length === 2, `(${rk.json?.length})`);

  const rkw = await rest(karim, "habits", {
    method: "POST",
    body: JSON.stringify({ player_id: lucas.user.id, name: "hack coach" }),
  });
  check("coach : création d'habitude pour un joueur refusée", rkw.status === 401 || rkw.status === 403, `(${rkw.status})`);

  const rs = await rest(sarah, `habits?select=id&player_id=eq.${lucas.user.id}`);
  check("autre coach : habitudes de Lucas invisibles", rs.json?.length === 0, `(${rs.json?.length})`);

  const habitId = rl.json?.[0]?.id;
  const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const rf = await rest(lucas, "habit_checks", {
    method: "POST",
    body: JSON.stringify({ habit_id: habitId, player_id: lucas.user.id, check_date: future }),
  });
  check("pointage dans le futur refusé", rf.status === 401 || rf.status === 403, `(${rf.status})`);

  // /habitudes est devenue un redirect("/dashboard") : on vérifie que la
  // redirection aboutit bien sur le dashboard (fetch suit les redirections)
  const page1 = await page(lucas, "/habitudes");
  check(
    "page /habitudes redirige vers le dashboard",
    page1.status === 200 && page1.body.includes("Dashboard")
  );

  const page2 = await page(lucas, "/seances");
  check(
    "page /seances (Basket + Physique regroupés) rend",
    page2.status === 200 && page2.body.includes("Mes séances")
  );
}

console.log("\n7. Cron");
{
  const res = await fetch(`${APP}/api/cron/notifications?secret=${process.env.CRON_SECRET}`);
  const json = await res.json();
  check("cron : exécution OK avec le secret", res.ok && json.ok === true, JSON.stringify(json));
  const bad = await fetch(`${APP}/api/cron/notifications?secret=faux`);
  check("cron : refus sans le bon secret (401)", bad.status === 401);
}

console.log(`\n=== ${passed} tests réussis, ${failed} échec(s) ===`);
process.exit(failed > 0 ? 1 : 0);
