import { listPatients } from "@/db/queries/patients";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { PatientsBoard } from "./patients-board";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/patients");

  /*
   * Read through tenantDb so RLS is the boundary rather than the clinicId
   * argument alone (prd-real-auth.md Phase A). The argument stays: it states
   * the intent and lets the planner use the clinic index, while the policy is
   * what survives someone forgetting it.
   */
  const patients = await tenantDb((tx) => listPatients(clinicId, tx));

  return <PatientsBoard patients={patients} />;
}
