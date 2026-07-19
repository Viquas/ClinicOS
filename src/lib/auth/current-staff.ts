import "server-only";
import { cookies } from "next/headers";
import { resolveStaffIdentity, type StaffIdentity } from "@/db/queries/staff";

/**
 * Who is using this device right now (§7.12 fast user-switching).
 *
 * This is the ONE place the rest of the app asks "who is this". Everything
 * downstream — nav filtering, role homes, the eventual per-action audit
 * actor — should call getCurrentStaff() rather than read the cookie or a
 * hardcoded staff id directly, so that swapping this for a real Supabase
 * session (see lib/auth/session.ts, which already exists for when auth is
 * wired) means changing this one function, not every call site.
 *
 * The PIN screen (login/page.tsx) is the device-session half described in
 * lib/auth/pin.ts's own comment: a real account normally holds the session
 * and the PIN just unlocks it locally. There is no real account here yet, so
 * the cookie IS the device session for now — set once at PIN-unlock, read
 * everywhere else.
 */
const COOKIE_NAME = "clinicos_active_staff_id";

/* Dr. Sameera Rahman — owner + doctor — so a fresh device with no cookie set
   sees the full app rather than an artificially restricted one. */
const DEFAULT_STAFF_ID = "22222222-0000-0000-0000-000000000001";

export async function getCurrentStaff(clinicId: string): Promise<StaffIdentity> {
  const cookieStore = await cookies();
  const staffId = cookieStore.get(COOKIE_NAME)?.value ?? DEFAULT_STAFF_ID;

  const identity = await resolveStaffIdentity(clinicId, staffId);
  if (identity) return identity;

  /* Cookie pointed at a staff id that no longer resolves — deactivated,
     archived, or stale after a reseed. Fall back rather than crashing the
     whole app chrome over a stale cookie. */
  const fallback = await resolveStaffIdentity(clinicId, DEFAULT_STAFF_ID);
  if (fallback) return fallback;

  throw new Error(
    "No staff record resolves for this clinic — has it been seeded?",
  );
}

export { COOKIE_NAME as CURRENT_STAFF_COOKIE };
