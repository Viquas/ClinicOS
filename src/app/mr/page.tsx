import { getBookableDoctors } from "@/db/queries/queue";
import { getMrQueue, getRepDirectory } from "@/db/queries/mr";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { MrBoard } from "./mr-board";

/*
 * Always render against current clinic state — a rep queue frozen at build
 * time would show yesterday's check-ins as still waiting. Any page reading
 * mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function MrPage() {
  await requireRouteAccess(CLINIC_ID, "/mr");
  const dayStart = new Date(`${TODAY}T00:00:00+05:30`);
  const dayEnd = new Date(`${TODAY}T23:59:59.999+05:30`);

  const [queue, directory, doctors] = await Promise.all([
    getMrQueue(CLINIC_ID, dayStart, dayEnd),
    getRepDirectory(CLINIC_ID),
    /* Walk-ins book a NEW visit — deactivated doctors must not appear. */
    getBookableDoctors(CLINIC_ID),
  ]);

  return (
    <MrBoard
      reps={queue.map((r) => ({
        ...r,
        scheduledFor: r.scheduledFor?.toISOString() ?? null,
        checkedInAt: r.checkedInAt?.toISOString() ?? null,
      }))}
      directory={directory}
      doctors={doctors}
    />
  );
}
