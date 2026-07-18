import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests are pure and DB-free; integration tests hit the local Postgres
// (DATABASE_URL). `dotenv/config` loads .env locally; CI passes env directly.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["dotenv/config"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration tests share one Postgres database; run files serially so
    // concurrent suites don't clobber each other's rows.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
