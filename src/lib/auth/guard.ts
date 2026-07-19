import "server-only";
import type { StaffIdentity } from "@/db/queries/staff";
import { getCurrentStaff } from "./current-staff";
import { refusalFor, type Permission } from "./permissions";

/**
 * The entry point for every mutating server action (§7.8): resolves who is
 * actually signed in on this device and checks the permission in one call,
 * so an action cannot read the identity without also stating what it needs.
 *
 * Returns a result rather than throwing because every action in this app
 * already speaks `{ ok: false, error }` — a refusal renders through the same
 * error banner as any other failure, with a message that names who CAN do it.
 *
 * This is the application-level gate. Nav filtering above it is wayfinding;
 * RLS below it is the database boundary once real auth lands. All three are
 * meant to agree — see lib/auth/permissions.ts for the single matrix.
 */
export async function requireCurrentStaffCan(
  clinicId: string,
  permission: Permission,
): Promise<{ ok: true; staff: StaffIdentity } | { ok: false; error: string }> {
  const staff = await getCurrentStaff(clinicId);

  const refusal = refusalFor(staff.name, staff.roles, permission);
  if (refusal) return { ok: false, error: refusal };

  return { ok: true, staff };
}
