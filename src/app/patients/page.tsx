import { listPatients } from "@/db/queries/patients";
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
  await requireRouteAccess(await getActiveClinicId(), "/patients");
  const patients = await listPatients(await getActiveClinicId());
  return <PatientsBoard patients={patients} />;
}
