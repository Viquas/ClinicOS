import { getDoctors, getQueue } from "@/db/queries/queue";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { DisplayBoard } from "./display-board";

/*
 * Always render against current clinic state — this screen runs unattended
 * on a waiting-room TV for hours; frozen data here means real patients read
 * a token number that stopped updating. Any page reading mutable clinic
 * data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function DisplayPage() {
  const TODAY = clinicToday();
  const clinicId = await getActiveClinicId();
  const [queue, doctors] = await tenantDb((tx) =>
    Promise.all([getQueue(clinicId, TODAY, tx), getDoctors(clinicId, tx)]),
  );

  return <DisplayBoard queue={queue} doctors={doctors} />;
}
