import "server-only";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { withClaims } from "./with-claims";
import type { db } from "./index";

export type Executor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs a callback as the signed-in caller, with RLS applying — the
 * request-scoped half of prd-real-auth.md Phase A.
 *
 * withClaims takes claims explicitly so it stays testable; this resolves them
 * from whoever is actually on the device. When Phase B lands, the two lines
 * below become one read of the verified session and nothing else changes:
 * that is the entire reason getCurrentStaff() and getActiveClinicId() were
 * built as single resolution points rather than inlined everywhere.
 */
export async function tenantDb<T>(
  fn: (tx: Executor) => Promise<T>,
): Promise<T> {
  const clinicId = await getActiveClinicId();
  const staff = await getCurrentStaff(clinicId);

  return withClaims(
    { clinicId, staffId: staff.id, staffRoles: staff.roles },
    (tx) => fn(tx),
  );
}
