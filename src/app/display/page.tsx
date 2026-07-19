import { getDoctors, getQueue } from "@/db/queries/queue";
import { DisplayBoard } from "./display-board";

/*
 * Always render against current clinic state — this screen runs unattended
 * on a waiting-room TV for hours; frozen data here means real patients read
 * a token number that stopped updating. Any page reading mutable clinic
 * data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function DisplayPage() {
  const [queue, doctors] = await Promise.all([
    getQueue(CLINIC_ID, TODAY),
    getDoctors(CLINIC_ID),
  ]);

  return <DisplayBoard queue={queue} doctors={doctors} />;
}
