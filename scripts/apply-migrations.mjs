// Applique les migrations SQL (supabase/migrations/*.sql) sur la base
// Supabase via la connexion directe Postgres (DATABASE_URL dans .env.local).
// Idempotent : les migrations déjà appliquées sont ignorées.
// Usage : npm run migrate
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant dans .env.local");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(
    "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())"
  );
  const { rows } = await client.query("select name from public._migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`— ${file} (déjà appliquée)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`→ ${file}…`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`✓ ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }
  console.log("Migrations à jour.");
} finally {
  await client.end();
}
