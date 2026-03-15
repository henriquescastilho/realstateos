import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

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
    console.log(`[migrate] applying ${hash}...`);

    try {
      await pool.query(sql);
    } catch (err: any) {
      if (err.code === "42P07") {
        // relation already exists — mark as applied and continue
        console.log(`[migrate] ${hash} already exists, marking as applied`);
      } else {
        throw err;
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
