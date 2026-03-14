import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;

let pool: Pool | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getPool(): Pool {
  if (!pool) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/**
 * Lazy-initialized Drizzle database instance.
 * Throws at first query time (not import time) if DATABASE_URL is missing.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) {
      _db = drizzle(getPool(), { schema });
    }
    return (_db as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export { pool };
