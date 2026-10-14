// Programme le passage de Claude du matin DANS la base Supabase (pg_cron +
// pg_net) : la base appelle /api/cron/brief sur la prod. Deux tirs, 5h et 6h
// UTC, pour couvrir 7h de Paris été comme hiver — la route ne travaille qu'à
// 7h heure de Paris et ne réécrit jamais un brief déjà fait.
// Idempotent : relancer remplace le job existant.
// Usage : npm run setup:cron:brief   (ajouter --test pour un appel immédiat)
import pg from "pg";

const url = process.env.DATABASE_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  console.error("DATABASE_URL ou CRON_SECRET manquant dans .env.local");
  process.exit(1);
}

const JOB = "vpf-brief-matin";
const endpoint = `https://vpf-app.vercel.app/api/cron/brief?secret=${secret}`;
const sqlUrl = endpoint.replace(/'/g, "''");
const withTest = process.argv.includes("--test");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("create extension if not exists pg_cron");
  await client.query("create extension if not exists pg_net");
  await client.query("select cron.unschedule(jobid) from cron.job where jobname = $1", [JOB]);
  await client.query("select cron.schedule($1, '0 5,6 * * *', $2)", [
    JOB,
    `select net.http_get(url := '${sqlUrl}', timeout_milliseconds := 55000)`,
  ]);
  const { rows } = await client.query(
    "select jobid, jobname, schedule, active from cron.job where jobname = $1",
    [JOB]
  );
  console.log("Job pg_cron programmé :", rows[0]);

  if (withTest) {
    const {
      rows: [req],
    } = await client.query(
      `select net.http_get(url := '${sqlUrl.replace("?secret=", "?force=1&secret=")}', timeout_milliseconds := 55000) as id`
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
    console.log("Réponse du test :", status, body ? body.slice(0, 400) : "(pas de corps)");
  }
} finally {
  await client.end();
}
