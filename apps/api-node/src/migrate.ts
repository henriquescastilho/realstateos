import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL UNIQUE,
      created_at bigint
    )
  `);

  // Reset migrations that were incorrectly marked as applied
  // (they may have failed mid-way due to partial execution)
  await pool.query(`DELETE FROM __drizzle_migrations`);

  const migrationsDir = path.join(__dirname, "../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8"),
  );

  for (const entry of journal.entries) {
    const hash = entry.tag;
    const { rows } = await pool.query(
      "SELECT id FROM __drizzle_migrations WHERE hash = $1",
      [hash],
    );
    if (rows.length > 0) {
      console.log(`[migrate] skipping ${hash} (already applied)`);
      continue;
    }

    const sqlFile = path.join(migrationsDir, `${hash}.sql`);
    const sql = fs.readFileSync(sqlFile, "utf8");

    // Split into individual statements and run each one separately
    const statements = sql
      .split(/;(\s*\n|\s*$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(
      `[migrate] applying ${hash} (${statements.length} statements)...`,
    );
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err: any) {
        if (err.code === "42P07" || err.code === "42710") {
          // relation/index already exists — skip
        } else {
          throw err;
        }
      }
    }

    await pool.query(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING",
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
