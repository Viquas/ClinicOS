import { ScreenHeader } from "@/components/screen-header";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { EmptyState } from "@/components/ui/empty-state";
import { getDispensingContext } from "@/db/queries/dispensing";
import { PharmacyCounter } from "./pharmacy-counter";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function PharmacyPage() {
  const TODAY = clinicToday();
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/pharmacy");
  const context = await tenantDb((tx) =>
    getDispensingContext(clinicId, TODAY, tx),
  );

  if (!context) {
    return (
      <>
        <ScreenHeader title="Pharmacy" />
        <EmptyState
          title="No one at the counter"
          hint="A patient appears here once the doctor sends their prescription to the pharmacy."
        />
      </>
    );
  }

  return <PharmacyCounter context={context} today={TODAY} />;
}
