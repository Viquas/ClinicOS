"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveStaffIdentity } from "@/db/queries/staff";
import { CURRENT_STAFF_COOKIE } from "./current-staff";

/* Until real auth is wired, the clinic is fixed to the seeded scenario —
   matches every page.tsx's CLINIC_ID constant. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Called once a staff member's PIN is accepted on the device (§7.12). Sets
 * the device-session cookie that getCurrentStaff() reads everywhere else.
 *
 * Re-resolves the staffId server-side rather than trusting the client's PIN
 * check alone — the PIN pad is a UX gate against the wrong person picking up
 * the tablet, not a security boundary (see lib/auth/pin.ts), so this still
 * confirms the id names a real, active staff member before setting anything.
 */
export async function switchStaffAction(staffId: string) {
  const identity = await resolveStaffIdentity(CLINIC_ID, staffId);
  if (!identity) {
    return { ok: false as const, error: "That staff member is not active" };
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_STAFF_COOKIE, identity.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/home");
}
