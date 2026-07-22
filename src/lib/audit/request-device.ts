import "server-only";
import { headers } from "next/headers";

/**
 * The device behind the current request, for the audit trail (§9 —
 * "IP/device, optional but recommended" on anything signed).
 *
 * Best-effort by design: behind the clinic's router every tablet may share
 * one NAT'd IP, and user agents lie — this is corroborating detail for a
 * dispute, never an identity mechanism. That job belongs to real auth
 * (docs/prd-real-auth.md).
 */
export async function getRequestDevice(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const userAgent = h.get("user-agent")?.slice(0, 256) ?? null;
    return { ip, userAgent };
  } catch {
    /* Outside a request scope, or a header store failure — device detail is
       corroboration, never worth failing the write it decorates. */
    return { ip: null, userAgent: null };
  }
}
