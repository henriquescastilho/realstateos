import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Run tests sequentially to avoid DB connection contention
    pool: "forks",
    setupFiles: [],
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "", // enables test-bypass mode in requireAuth
    },
  },
});
