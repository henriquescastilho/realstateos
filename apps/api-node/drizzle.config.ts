import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // example placeholder for local dev — override via DATABASE_URL env var
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/realestateos",
  },
  verbose: true,
  strict: true,
});
