// Programme l'appel du cron de notifications toutes les 10 minutes DANS la
// base Supabase (extensions pg_cron + pg_net) — remplace cron-job.org : aucun
// service externe, Postgres appelle lui-même l'endpoint de prod.
// Idempotent : relancer remplace le job existant.
// Usage : npm run setup:cron  (ou node --env-file=.env.local scripts/setup-pg-cron.mjs)
import pg from "pg";

const url = process.env.DATABASE_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  console.error("DATABASE_URL ou CRON_SECRET manquant dans .env.local");
  process.exit(1);
}

// URL de PROD en dur : NEXT_PUBLIC_APP_URL du .env.local pointe sur localhost
const JOB = "vpf-notifications";
const endpoint = `https://vpf-app.vercel.app/api/cron/notifications?secret=${secret}`;
const sqlUrl = endpoint.replace(/'/g, "''");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("create extension if not exists pg_cron");
  await client.query("create extension if not exists pg_net");

  // remplace le job s'il existe déjà
  await client.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [JOB]);
  await client.query("select cron.schedule($1, '*/10 * * * *', $2)", [
    JOB,
    // maxDuration de la route = 60 s → timeout un cran en dessous
    `select net.http_get(url := '${sqlUrl}', timeout_milliseconds := 55000)`,
  ]);
  const { rows } = await client.query(
    "select jobid, jobname, schedule, active from cron.job where jobname = $1",
    [JOB]
  );
  console.log("Job pg_cron programmé :", rows[0]);

  // Test immédiat : le même appel que fera le job, réponse lue dans pg_net
  const {
    rows: [req],
  } = await client.query(
    `select net.http_get(url := '${sqlUrl}', timeout_milliseconds := 55000) as id`
  );
  console.log(`Appel de test lancé (request ${req.id}), attente de la réponse…`);
  let status = null;
  let body = null;
  for (let i = 0; i < 30 && status === null; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { rows: resp } = await client.query(
      "select status_code, content from net._http_response where id = $1",
      [req.id]
    );
    if (resp[0]?.status_code != null) {
      status = resp[0].status_code;
      body = resp[0].content;
    }
  }
  if (status === null) {
    console.error("Pas de réponse après 60 s — vérifier net._http_response à la main.");
    process.exit(1);
  }
  console.log("Réponse du test :", status, body ? body.slice(0, 300) : "(pas de corps)");
  if (status !== 200) process.exit(1);
} finally {
  await client.end();
}
