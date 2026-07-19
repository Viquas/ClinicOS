import { getBookableDoctors } from "@/db/queries/queue";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { ReceptionDesk } from "./reception-desk";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function ReceptionPage() {
  await requireRouteAccess(CLINIC_ID, "/reception");
  const doctors = await getBookableDoctors(CLINIC_ID);
  return <ReceptionDesk doctors={doctors} />;
}
