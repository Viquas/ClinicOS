import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  test: {
    /*
     * Unit tests only by default: fast, offline, no database.
     * Integration tests (*.itest.ts) need a live Postgres and run via
     * `pnpm test:db`.
     */
    include: ["src/**/*.test.ts"],
  },
});
