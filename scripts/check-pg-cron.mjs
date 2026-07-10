// Vérifie les dernières exécutions du job pg_cron « vpf-notifications »
// et le code HTTP des réponses pg_net correspondantes.
// Usage : node --env-file=.env.local scripts/check-pg-cron.mjs
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const { rows: runs } = await client.query(`
    select d.runid, d.status, d.return_message, d.start_time
    from cron.job_run_details d
    join cron.job j using (jobid)
    where j.jobname = 'vpf-notifications'
    order by d.start_time desc
    limit 5
  `);
  console.log("Dernières exécutions du job :");
  for (const r of runs) {
    console.log(` ${r.start_time.toISOString()} — ${r.status} — ${r.return_message}`);
  }
  const { rows: resp } = await client.query(
    "select id, status_code, created from net._http_response order by id desc limit 5"
  );
  console.log("Dernières réponses HTTP (pg_net) :");
  for (const r of resp) {
    console.log(` request ${r.id} — HTTP ${r.status_code} — ${r.created.toISOString()}`);
  }
} finally {
  await client.end();
}
