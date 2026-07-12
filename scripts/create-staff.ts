/**
 * Création d'un compte staff (admin ou coach) avec de vrais identifiants.
 * Usage :
 *   npm run create:staff -- admin "email@exemple.fr" "MotDePasse" "Prénom" "Nom"
 *   npm run create:staff -- coach "email@exemple.fr" "MotDePasse" "Prénom" "Nom" "+33 6 12 34 56 78"
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local.
 * ⚠️ La base est partagée local/prod : le compte créé est immédiatement utilisable en prod.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}

const [role, emailArg, password, firstName, lastName, whatsapp] = process.argv.slice(2);

function usage(message: string): never {
  console.error(`Erreur : ${message}\n`);
  console.error('Usage : npm run create:staff -- <admin|coach> "email" "mot de passe" "Prénom" "Nom" ["+33 whatsapp (coach)"]');
  process.exit(1);
}

if (role !== "admin" && role !== "coach") usage("le rôle doit être admin ou coach");
const email = (emailArg ?? "").trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) usage("email invalide");
if (!password || password.length < 8) usage("mot de passe : 8 caractères minimum");
if (!firstName?.trim() || !lastName?.trim()) usage("prénom et nom obligatoires");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) {
    if (error?.message.includes("already")) {
      console.error(`Un compte existe déjà avec ${email}.`);
      console.error("Pour changer son mot de passe ou son rôle, demande-le explicitement — pas de modification automatique.");
    } else {
      console.error(`Création impossible : ${error?.message ?? "erreur inconnue"}`);
    }
    process.exit(1);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    role,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    whatsapp_number: (whatsapp ?? "").trim(),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    console.error(`Profil impossible à créer (compte annulé) : ${profileError.message}`);
    process.exit(1);
  }

  console.log(`✓ ${role === "admin" ? "Admin" : "Coach"} créé : ${email} (${firstName} ${lastName})`);
  console.log("Connexion : https://vpf-app.vercel.app/login");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
