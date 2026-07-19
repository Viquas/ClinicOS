import { getDoctors, getQueue } from "@/db/queries/queue";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { DisplayBoard } from "./display-board";

/*
 * Always render against current clinic state — this screen runs unattended
 * on a waiting-room TV for hours; frozen data here means real patients read
 * a token number that stopped updating. Any page reading mutable clinic
 * data must be dynamic.
 */
export const dynamic = "force-dynamic";

const TODAY = "2026-07-18";

export default async function DisplayPage() {
  const [queue, doctors] = await Promise.all([
    getQueue(await getActiveClinicId(), TODAY),
    getDoctors(await getActiveClinicId()),
  ]);

  return <DisplayBoard queue={queue} doctors={doctors} />;
}
