import { listPatients } from "@/db/queries/patients";
import { PatientsBoard } from "./patients-board";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function PatientsPage() {
  const patients = await listPatients(CLINIC_ID);
  return <PatientsBoard patients={patients} />;
}
