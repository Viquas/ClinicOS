import { ScreenHeader } from "@/components/screen-header";
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

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function PharmacyPage() {
  await requireRouteAccess(CLINIC_ID, "/pharmacy");
  const context = await getDispensingContext(CLINIC_ID, TODAY);

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

  return <PharmacyCounter context={context} />;
}
