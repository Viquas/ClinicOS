import { ScreenHeader } from "@/components/screen-header";
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

/* Until auth is wired, the clinic and date are fixed to the seeded scenario.
   Both become session-derived once the JWT claims are in play. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function QueuePage() {
  await requireRouteAccess(CLINIC_ID, "/queue");
  const [queue, doctors] = await Promise.all([
    getQueue(CLINIC_ID, TODAY),
    getDoctors(CLINIC_ID),
  ]);

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

  return <QueueBoard queue={queue} doctors={doctors} />;
}
