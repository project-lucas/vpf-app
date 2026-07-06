/**
 * Données de test VPF — usage : npm run seed
 * Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local
 * (les migrations doivent être appliquées avant : npm run migrate).
 *
 * Crée : 1 admin, 2 coachs, 5 joueurs, 2 séances basket + 2 physiques,
 * plannings types, réalisations, stats, bilans, check-ins, affectations,
 * 1 invitation en attente. Idempotent (réexécutable sans doublons).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "vpf-demo-2026";

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function currentWeekStart(): string {
  const today = parisToday();
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(today, 1 - (dow === 0 ? 7 : dow));
}

async function ensureUser(email: string): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created?.user) return created.user.id;
  if (error) {
    // utilisateur déjà existant : on le retrouve
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = data?.users.find((u) => u.email === email);
    if (existing) return existing.id;
    throw new Error(`Impossible de créer/retrouver ${email} : ${error.message}`);
  }
  throw new Error(`Impossible de créer ${email}`);
}

async function main() {
  console.log("— Seed VPF —\n");

  // ---------------------------------------------------------------- comptes
  const adminId = await ensureUser("admin@vpf.fr");
  await admin.from("profiles").upsert({
    id: adminId,
    role: "admin",
    first_name: "Admin",
    last_name: "VPF",
  });
  console.log("✓ Admin : admin@vpf.fr");

  const coachDefs = [
    { email: "coach.karim@vpf.fr", first_name: "Karim", last_name: "Benali", whatsapp_number: "+33 6 11 22 33 44" },
    { email: "coach.sarah@vpf.fr", first_name: "Sarah", last_name: "Dupont", whatsapp_number: "+33 6 55 66 77 88" },
  ];
  const coachIds: string[] = [];
  for (const c of coachDefs) {
    const id = await ensureUser(c.email);
    await admin.from("profiles").upsert({ id, role: "coach", ...{ first_name: c.first_name, last_name: c.last_name, whatsapp_number: c.whatsapp_number } });
    coachIds.push(id);
    console.log(`✓ Coach : ${c.email}`);
  }

  const playerDefs = [
    { email: "joueur.lucas@vpf.fr", first_name: "Lucas", last_name: "Martin", coach: 0, position: "Meneur", club: "AS Meaux Basket", birthdate: "2009-03-14", height_cm: 175, weight_kg: 64, season_goal: "Devenir titulaire en U18 région et progresser au tir extérieur" },
    { email: "joueur.nina@vpf.fr", first_name: "Nina", last_name: "Kone", coach: 0, position: "Arrière", club: "Chelles Basket", birthdate: "2008-11-02", height_cm: 168, weight_kg: 58, season_goal: "Gagner en explosivité et scorer 10 pts/match" },
    { email: "joueur.theo@vpf.fr", first_name: "Théo", last_name: "Lambert", coach: 0, position: "Ailier", club: "Torcy Basket", birthdate: "2010-06-25", height_cm: 182, weight_kg: 70, season_goal: "Intégrer la sélection départementale" },
    { email: "joueur.emma@vpf.fr", first_name: "Emma", last_name: "Rossi", coach: 1, position: "Ailier fort", club: "Lagny MLV", birthdate: "2009-01-19", height_cm: 178, weight_kg: 66, season_goal: "Améliorer mon jeu dos au panier et ma défense" },
    { email: "joueur.adam@vpf.fr", first_name: "Adam", last_name: "Cherki", coach: 1, position: "Pivot", club: "Val d'Europe Basket", birthdate: "2008-08-30", height_cm: 191, weight_kg: 82, season_goal: "Dominer au rebond et jouer plus de minutes en senior" },
  ];

  const playerIds: string[] = [];
  for (const p of playerDefs) {
    const id = await ensureUser(p.email);
    await admin.from("profiles").upsert({ id, role: "player", first_name: p.first_name, last_name: p.last_name });
    await admin.from("players").upsert({
      id,
      coach_id: coachIds[p.coach],
      position: p.position,
      club: p.club,
      birthdate: p.birthdate,
      height_cm: p.height_cm,
      weight_kg: p.weight_kg,
      season_goal: p.season_goal,
      status: "active",
      onboarding_completed: true,
    });
    playerIds.push(id);
    console.log(`✓ Joueur : ${p.email}`);
  }

  // ------------------------------------------------------------ bibliothèque
  const sessions = [
    { name: "Tir en sortie de dribble", pole: "basket", category: "Tir", youtube_url: "https://youtu.be/dQw4w9WgXcQ", duration_minutes: 35, equipment: "Ballon, panier" },
    { name: "Finitions main faible", pole: "basket", category: "Finition", youtube_url: "https://youtu.be/dQw4w9WgXcQ", duration_minutes: 30, equipment: "Ballon, plots" },
    { name: "Mobilité hanches & chevilles", pole: "physique", category: "Mobilité", youtube_url: "https://youtu.be/dQw4w9WgXcQ", duration_minutes: 20, equipment: "Tapis" },
    { name: "Circuit explosivité bas du corps", pole: "physique", category: "Explosivité", youtube_url: "https://youtu.be/dQw4w9WgXcQ", duration_minutes: 25, equipment: "Aucun" },
  ] as const;

  const sessionIds: string[] = [];
  for (const s of sessions) {
    const { data: existing } = await admin
      .from("library_sessions")
      .select("id")
      .eq("name", s.name)
      .maybeSingle();
    if (existing) {
      sessionIds.push(existing.id);
    } else {
      const { data, error } = await admin.from("library_sessions").insert(s).select("id").single();
      if (error) throw error;
      sessionIds.push(data.id);
    }
  }
  console.log(`✓ Bibliothèque : ${sessions.length} séances`);

  // ------------------------------------------------------------- plannings
  const weekStart = currentWeekStart();
  const prevWeekStart = addDays(weekStart, -7);

  const templates: Record<number, [string, number, string][]> = {
    0: [
      ["entrainement_club", 2, "18:30"],
      ["training_basket", 3, "17:30"],
      ["prep_physique", 4, "18:00"],
      ["mobilite", 5, "19:30"],
      ["revision_scolaire", 1, "18:00"],
      ["dormir", 1, "22:00"],
      ["dormir", 3, "22:00"],
      ["collation", 6, "16:30"],
      ["entrainement_club", 6, "10:00"],
    ],
    1: [
      ["entrainement_club", 1, "18:00"],
      ["training_basket", 3, "17:00"],
      ["prep_physique", 5, "18:30"],
      ["dormir", 2, "22:15"],
      ["revision_scolaire", 4, "17:30"],
      ["collation", 3, "16:45"],
    ],
  };

  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    const { count } = await admin
      .from("planned_events")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);
    if ((count ?? 0) > 0) continue; // déjà seedé

    const template = templates[i % 2];
    const { data: inserted, error } = await admin
      .from("planned_events")
      .insert(
        template.map(([event_type, weekday, event_time]) => ({
          player_id: playerId,
          event_type,
          weekday,
          event_time,
        }))
      )
      .select("*");
    if (error) throw error;

    // Semaine précédente : entièrement pointée (mix fait / pas fait),
    // sauf pour le dernier joueur (discipline faible pour tester les alertes)
    const doneRatio = i === playerIds.length - 1 ? 0.35 : 0.85;
    await admin.from("event_completions").insert(
      (inserted ?? []).map((e, j) => ({
        player_id: playerId,
        planned_event_id: e.id,
        week_start: prevWeekStart,
        event_type: e.event_type,
        weekday: e.weekday,
        event_time: e.event_time,
        status: (j / (inserted ?? []).length < doneRatio ? "done" : "not_done") as "done" | "not_done",
        comment: j === 0 ? "Bonne séance, un peu fatigué à la fin" : "",
      }))
    );

    const total = (inserted ?? []).length;
    const done = Math.round(total * doneRatio);
    await admin.from("weekly_summaries").upsert(
      { player_id: playerId, week_start: prevWeekStart, planned_count: total, done_count: done },
      { onConflict: "player_id,week_start" }
    );

    // Semaine courante : quelques pointages sur les premiers jours
    const early = (inserted ?? []).filter((e) => e.weekday <= 2);
    if (early.length > 0) {
      await admin.from("event_completions").insert(
        early.map((e) => ({
          player_id: playerId,
          planned_event_id: e.id,
          week_start: weekStart,
          event_type: e.event_type,
          weekday: e.weekday,
          event_time: e.event_time,
          status: "done" as const,
        }))
      );
    }
  }
  console.log("✓ Plannings types + réalisations");

  // ----------------------------------------------------- stats, bilans, etc.
  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];

    const { count: statCount } = await admin
      .from("match_stats")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);
    if ((statCount ?? 0) === 0) {
      // feuilles de démo cohérentes : points = 3×3pts + 2×2pts + LF, tirs réussis = 3pts + 2pts
      const match = (
        match_date: string,
        is_starter: boolean,
        minutes: number,
        threes: number,
        twosIn: number,
        twosOut: number,
        ft: number,
        fouls: number
      ) => ({
        player_id: playerId,
        match_date,
        is_starter,
        minutes,
        threes_made: threes,
        twos_inside_made: twosIn,
        twos_outside_made: twosOut,
        free_throws_made: ft,
        fouls,
        shots_made: threes + twosIn + twosOut,
        points: 3 * threes + 2 * (twosIn + twosOut) + ft,
      });
      await admin.from("match_stats").insert([
        match(addDays(weekStart, -6), true, 22 + i, 1 + (i % 2), 2 + i, 1, 2, 2),
        match(addDays(weekStart, -13), i % 2 === 0, 25, 2, 3, 1, 1, 3),
      ]);
    }

    await admin.from("weekly_reviews").upsert(
      {
        player_id: playerId,
        week_start: prevWeekStart,
        went_well: "J'ai respecté presque tout mon planning et bien travaillé mon tir.",
        to_improve: "Me coucher plus tôt les veilles d'entraînement.",
      },
      { onConflict: "player_id,week_start" }
    );

    const { count: checkinCount } = await admin
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);
    if ((checkinCount ?? 0) === 0) {
      await admin.from("checkins").insert({
        player_id: playerId,
        question: i % 2 === 0 ? "energy" : "pain",
        score: i % 2 === 0 ? 7 : 2,
      });
    }
  }
  console.log("✓ Stats match, bilans, check-ins");

  // ------------------------------------------------------------ affectations
  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    const { count } = await admin
      .from("session_assignments")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);
    if ((count ?? 0) > 0) continue;

    const coachId = coachIds[playerDefs[i].coach];
    await admin.from("session_assignments").insert([
      { session_id: sessionIds[i % 2], player_id: playerId, assigned_by: coachId, order_index: 1 },
      { session_id: sessionIds[2 + (i % 2)], player_id: playerId, assigned_by: coachId, order_index: 2 },
    ]);
  }
  console.log("✓ Séances affectées");

  // note visible d'exemple pour le premier joueur
  await admin.from("visible_notes").upsert(
    { player_id: playerIds[0], pole: "basket", content: "Focus main gauche cette semaine 💪" },
    { onConflict: "player_id,pole" }
  );

  // note privée coach d'exemple
  const { count: noteCount } = await admin
    .from("coach_notes")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerIds[0]);
  if ((noteCount ?? 0) === 0) {
    await admin.from("coach_notes").insert({
      player_id: playerIds[0],
      author_id: coachIds[0],
      content: "Très motivé, mais a tendance à se précipiter sur ses tirs en fin de match.",
    });
  }

  // ------------------------------------------------------------- habitudes
  const habitDefs = [
    {
      name: "Boire 2L d'eau",
      description: "Répartis sur la journée, gourde toujours dans le sac",
      goal: "Tous les jours",
      icon: "droplets",
      color: "gold",
      position: 1,
    },
    {
      name: "50 lancers francs",
      description: "Après chaque entraînement ou training perso",
      goal: "5x par semaine",
      icon: "target",
      color: "orange",
      position: 2,
    },
  ] as const;

  for (const playerId of playerIds.slice(0, 3)) {
    const { count: habitCount } = await admin
      .from("habits")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);
    if ((habitCount ?? 0) > 0) continue;

    for (const def of habitDefs) {
      const { data: habit, error } = await admin
        .from("habits")
        .insert({ player_id: playerId, ...def })
        .select("id")
        .single();
      if (error || !habit) throw error;

      // ~90 jours d'historique : ~80 % de réussite, les 9 derniers jours
      // tous cochés pour une belle série en cours
      const today = parisToday();
      const checks: { habit_id: string; player_id: string; check_date: string }[] = [];
      for (let d = 0; d < 90; d++) {
        const date = addDays(today, -d);
        const kept = d < 9 || (d * 7 + def.position * 3) % 10 < 8;
        if (kept) checks.push({ habit_id: habit.id, player_id: playerId, check_date: date });
      }
      await admin.from("habit_checks").insert(checks);
    }
  }
  // complète les habitudes de démo créées avant l'ajout des champs description/goal
  for (const def of habitDefs) {
    await admin
      .from("habits")
      .update({ description: def.description, goal: def.goal })
      .eq("name", def.name)
      .eq("description", "");
  }
  console.log("✓ Habitudes + historique heatmap");

  // invitation en attente
  const { count: invCount } = await admin
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .is("used_at", null);
  if ((invCount ?? 0) === 0) {
    const { data: inv } = await admin
      .from("invitations")
      .insert({ coach_id: coachIds[0], created_by: adminId, player_label: "Nouveau joueur (test)" })
      .select("id")
      .single();
    if (inv) console.log(`✓ Invitation en attente : /invitation/${inv.id}`);
  }

  console.log(`\nTerminé. Mot de passe de tous les comptes de test : ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
