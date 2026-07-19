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
 */
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
