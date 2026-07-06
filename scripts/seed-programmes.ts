/**
 * Programmes techniques par poste — usage : npm run seed:programmes
 * Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local
 * (la migration 0012 doit être appliquée avant : npm run migrate).
 *
 * Upsert des 20 séances (5 postes × 4) depuis scripts/data/programmes/*.json.
 * Contrairement à seed.ts (données de démo), ce contenu est destiné à la
 * production. Idempotent : ré-exécutable sans doublons, met à jour une séance
 * existante si son JSON a changé (clé = nom de la séance).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

interface ProgrammeExercise {
  order: number;
  title: string;
  durationMinutes: number;
  tag: string | null;
  description: string;
}

interface ProgrammeChallenge {
  durationMinutes: number | null;
  title: string;
  description: string;
  maxScore: number;
  scoreUnit: string;
  objective: string | null;
}

interface ProgrammeSeance {
  number: number;
  durationMinutes: number;
  title: string;
  subtitle: string;
  intro: string;
  exercises: ProgrammeExercise[];
  challenge: ProgrammeChallenge | null;
}

interface ProgrammeFile {
  poste: string;
  posteNumber: number;
  posteLabel: string;
  seances: ProgrammeSeance[];
}

/** « HANDLE & CONTRÔLE » → « Handle & contrôle » */
function sentenceCase(s: string): string {
  const lower = s.toLocaleLowerCase("fr-FR");
  return lower.charAt(0).toLocaleUpperCase("fr-FR") + lower.slice(1);
}

/** Matériel déduit du contenu (toutes les séances se font ballon + panier). */
function equipmentOf(seance: ProgrammeSeance): string {
  const text = [
    ...seance.exercises.map((e) => e.description),
    seance.challenge?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const extras = [text.includes("cône") ? "cônes" : "", text.includes("mur") ? "mur" : ""];
  return ["Ballon", "panier", ...extras.filter(Boolean)].join(", ");
}

async function main() {
  console.log("— Seed programmes par poste —\n");

  const dir = join(process.cwd(), "scripts", "data", "programmes");
  const programmes = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ProgrammeFile)
    .sort((a, b) => a.posteNumber - b.posteNumber);

  let inserted = 0;
  let updated = 0;

  for (const programme of programmes) {
    for (const seance of programme.seances) {
      const name = `${programme.posteLabel} S${seance.number} · ${sentenceCase(seance.title)}`;
      const row = {
        name,
        pole: "basket",
        category: "Programme",
        youtube_url: "",
        duration_minutes: seance.durationMinutes,
        equipment: equipmentOf(seance),
        positions: [programme.posteLabel],
        subtitle: seance.subtitle,
        intro: seance.intro,
        exercises: seance.exercises,
        challenge: seance.challenge,
      };

      const { data: existing } = await admin
        .from("library_sessions")
        .select("id")
        .eq("name", name)
        .maybeSingle();

      if (existing) {
        const { error } = await admin.from("library_sessions").update(row).eq("id", existing.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await admin.from("library_sessions").insert(row);
        if (error) throw error;
        inserted++;
      }
    }
    console.log(`✓ ${programme.posteLabel} : ${programme.seances.length} séances`);
  }

  console.log(`\nTerminé : ${inserted} créées, ${updated} mises à jour.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
