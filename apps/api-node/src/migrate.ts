import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

const IGNORED = new Set([
  "42P07",
  "42710",
  "42703",
  "42P01",
  "42P10",
  "23505",
  "42701",
]);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Recreate tracking table cleanly
  await pool.query(`DROP TABLE IF EXISTS __drizzle_migrations`);
  await pool.query(`
    CREATE TABLE __drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL UNIQUE,
      created_at bigint
    )
  `);

  const migrationsDir = path.join(__dirname, "../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8"),
  );

  for (const entry of journal.entries) {
    const hash = entry.tag;
    const sqlFile = path.join(migrationsDir, `${hash}.sql`);
    const sql = fs.readFileSync(sqlFile, "utf8");

    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(
      `[migrate] applying ${hash} (${statements.length} statements)...`,
    );
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err: any) {
        if (IGNORED.has(err.code)) {
          // already exists or constraint mismatch — skip
        } else {
          throw err;
        }
      }
    }

    await pool.query(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [hash, Date.now()],
    );
    console.log(`[migrate] applied ${hash}`);
  }

  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
