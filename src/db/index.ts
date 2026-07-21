import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/*
 * Fluid Compute reuses function instances across concurrent requests, so a
 * single pooled client per instance is correct here — not one per request.
 *
 * In development the client is cached on globalThis. Next's HMR re-evaluates
 * this module on every edit, and each fresh evaluation would otherwise open a
 * new pool without closing the old — after a dozen saves Postgres hits
 * `too many clients already` and the whole app stops loading. The cache keeps
 * one pool alive across reloads. Production never re-evaluates the module, so
 * the branch collapses to a single `postgres(...)` call there.
 */
const globalForDb = globalThis as unknown as {
  __clinicosDbClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__clinicosDbClient ?? postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__clinicosDbClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
