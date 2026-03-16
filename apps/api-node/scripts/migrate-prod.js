/**
 * Production migration script — runs 0003_production_schema.sql directly via pg.
 * Used because drizzle-kit migrate fails on already-existing tables.
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("[migrate] Connected to database");

  const sqlPath = path.join(__dirname, "../drizzle/0003_production_schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  // Split on --> statement-breakpoint and run each chunk
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      console.log("[migrate] OK:", stmt.slice(0, 60).replace(/\n/g, " "));
    } catch (err) {
      if (
        err.code === "42701" ||
        err.code === "42P07" ||
        err.code === "42P16"
      ) {
        console.log(
          "[migrate] SKIP (already exists):",
          stmt.slice(0, 60).replace(/\n/g, " "),
        );
      } else {
        console.error(
          "[migrate] ERROR:",
          err.message,
          "\n",
          stmt.slice(0, 120),
        );
      }
    }
  }

  await client.end();
  console.log("[migrate] Done");
}

main().catch((err) => {
  console.error("[migrate] Fatal:", err.message);
  process.exit(0); // Don't block app startup
});
