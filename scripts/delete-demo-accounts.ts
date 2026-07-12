/**
 * Supprime les comptes de démo créés par le seed (coachs + joueurs fictifs).
 * Usage :
 *   npm run delete:demo            # aperçu (dry-run), ne supprime rien
 *   npm run delete:demo -- --run   # suppression réelle
 *
 * Ne touche PAS à admin@vpf.fr ni aux vrais comptes. Les données des joueurs
 * (planning, stats, habitudes…) partent en cascade avec leur compte.
 * ⚠️ Base partagée local/prod : la suppression est effective en prod.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}

const DEMO_PLAYERS = [
  "joueur.lucas@vpf.fr",
  "joueur.nina@vpf.fr",
  "joueur.theo@vpf.fr",
  "joueur.emma@vpf.fr",
  "joueur.adam@vpf.fr",
];
const DEMO_COACHES = ["coach.karim@vpf.fr", "coach.sarah@vpf.fr"];

const doRun = process.argv.includes("--run");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const byEmail = new Map(data.users.map((u) => [u.email ?? "", u.id]));

  // joueurs d'abord (players.coach_id est en "on delete restrict" côté coach)
  for (const group of [
    { label: "Joueur", emails: DEMO_PLAYERS },
    { label: "Coach", emails: DEMO_COACHES },
  ]) {
    for (const email of group.emails) {
      const id = byEmail.get(email);
      if (!id) {
        console.log(`— ${group.label} ${email} : absent (déjà supprimé ?)`);
        continue;
      }
      if (!doRun) {
        console.log(`[dry-run] ${group.label} ${email} serait supprimé`);
        continue;
      }
      const { error: delError } = await admin.auth.admin.deleteUser(id);
      if (delError) {
        console.error(`✗ ${group.label} ${email} : ${delError.message}`);
        process.exitCode = 1;
      } else {
        console.log(`✓ ${group.label} ${email} supprimé (données en cascade)`);
      }
    }
  }

  if (!doRun) console.log("\nAperçu seulement — relance avec --run pour supprimer.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
