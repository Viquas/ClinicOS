import { createClient } from "@/lib/supabase/server";
import { parseClaims, type Session } from "./claims";
import { assertCan, type Permission } from "./permissions";

/**
 * Reads the caller's session from the verified JWT.
 *
 * Uses getClaims() rather than getSession(): the cookie-borne session is
 * client-supplied and unverified, whereas getClaims() validates the token
 * signature. Never trust getSession() for authorization decisions.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  if (!userId) return null;

  return parseClaims(claims, userId);
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("No active clinic session");
    this.name = "UnauthenticatedError";
  }
}

/**
 * The entry point for every server action that touches clinic data: resolves
 * the session and checks the permission in one call, so an action cannot
 * accidentally read the session without also stating what it needs.
 */
export async function requirePermission(
  permission: Permission,
): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();

  assertCan(session.roles, permission);
  return session;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}
