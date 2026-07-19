import "server-only";
import { cookies } from "next/headers";
import {
  resolveFallbackStaff,
  resolveStaffIdentity,
  type StaffIdentity,
} from "@/db/queries/staff";

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

export async function getCurrentStaff(clinicId: string): Promise<StaffIdentity> {
  const cookieStore = await cookies();
  const staffId = cookieStore.get(COOKIE_NAME)?.value;

  if (staffId) {
    const identity = await resolveStaffIdentity(clinicId, staffId);
    if (identity) return identity;
  }

  /*
   * No cookie (fresh device), or it pointed at a staff id that no longer
   * resolves — deactivated, archived, or stale after a reseed. Fall back to
   * an active owner (else any active staff) rather than crashing the whole
   * app chrome. This used to fall back to one hardcoded staff id, which
   * would have bricked every device in the clinic the day that specific
   * person was deactivated.
   */
  const fallback = await resolveFallbackStaff(clinicId);
  if (fallback) return fallback;

  throw new Error(
    "No active staff resolves for this clinic — has it been seeded?",
  );
}

export { COOKIE_NAME as CURRENT_STAFF_COOKIE };
