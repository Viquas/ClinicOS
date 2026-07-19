import { getBookableDoctors } from "@/db/queries/queue";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getMrQueue, getRepDirectory } from "@/db/queries/mr";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { MrBoard } from "./mr-board";

/*
 * Always render against current clinic state — a rep queue frozen at build
 * time would show yesterday's check-ins as still waiting. Any page reading
 * mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

const TODAY = "2026-07-18";

export default async function MrPage() {
  await requireRouteAccess(await getActiveClinicId(), "/mr");
  const dayStart = new Date(`${TODAY}T00:00:00+05:30`);
  const dayEnd = new Date(`${TODAY}T23:59:59.999+05:30`);

  const [queue, directory, doctors] = await Promise.all([
    getMrQueue(await getActiveClinicId(), dayStart, dayEnd),
    getRepDirectory(await getActiveClinicId()),
    /* Walk-ins book a NEW visit — deactivated doctors must not appear. */
    getBookableDoctors(await getActiveClinicId()),
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
