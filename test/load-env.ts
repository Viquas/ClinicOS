/*
 * Loaded via vitest `setupFiles`, which runs before any test module is
 * imported. Calling dotenv inside the test file itself does not work: ESM
 * hoists the imports above it, so db/index.ts reads process.env and throws
 * before the config call ever executes.
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });
