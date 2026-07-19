import { ScreenHeader } from "@/components/screen-header";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { EmptyState } from "@/components/ui/empty-state";
import { getDoctors, getQueue } from "@/db/queries/queue";
import { QueueBoard } from "./queue-board";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/**
 * Queue (§7.2) — server component.
 *
 * Data is fetched here and handed to a client component for the doctor
 * switcher. Keeping the fetch on the server means the connection and the
 * session claims never reach the browser, and the first paint already has
 * the queue in it — which matters on a clinic tablet on tier-3 connectivity.
 */


export default async function QueuePage() {
  const TODAY = clinicToday();
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/queue");

  /* One tenant transaction for the screen — both reads run under RLS on the
     same connection (prd-real-auth.md Phase A). */
  const [queue, doctors] = await tenantDb((tx) =>
    Promise.all([getQueue(clinicId, TODAY, tx), getDoctors(clinicId, tx)]),
  );

  if (doctors.length === 0) {
    return (
      <>
        <ScreenHeader title="Queue" />
        <EmptyState
          title="No doctors set up yet"
          hint="Add a doctor in Settings before issuing tokens."
        />
      </>
    );
  }

  return <QueueBoard queue={queue} doctors={doctors} today={TODAY} />;
}
