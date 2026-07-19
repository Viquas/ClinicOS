import { getBookableDoctors } from "@/db/queries/queue";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { ReceptionDesk } from "./reception-desk";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function ReceptionPage() {
  await requireRouteAccess(await getActiveClinicId(), "/reception");
  const doctors = await getBookableDoctors(await getActiveClinicId());
  return <ReceptionDesk doctors={doctors} />;
}
