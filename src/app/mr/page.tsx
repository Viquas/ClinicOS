import { getBookableDoctors } from "@/db/queries/queue";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
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


export default async function MrPage() {
  const TODAY = clinicToday();
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/mr");
  const dayStart = new Date(`${TODAY}T00:00:00+05:30`);
  const dayEnd = new Date(`${TODAY}T23:59:59.999+05:30`);

  const [queue, directory, doctors] = await tenantDb((tx) => Promise.all([
    getMrQueue(clinicId, dayStart, dayEnd, tx),
    getRepDirectory(clinicId, tx),
    /* Walk-ins book a NEW visit — deactivated doctors must not appear. */
    getBookableDoctors(clinicId, tx),
  ]));

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
