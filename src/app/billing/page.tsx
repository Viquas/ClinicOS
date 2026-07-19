import { ScreenHeader } from "@/components/screen-header";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { EmptyState } from "@/components/ui/empty-state";
import { getBillableVisit } from "@/db/queries/billable";
import { getBillDraft } from "@/db/queries/billing";
import { BillingScreen } from "./billing-screen";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

const TODAY = "2026-07-18";

export default async function BillingPage() {
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/billing");
  const billable = await tenantDb((tx) =>
    getBillableVisit(clinicId, TODAY, tx),
  );

  if (!billable) {
    return (
      <>
        <ScreenHeader title="Billing" />
        <EmptyState
          title="Nothing to bill"
          hint="A visit appears here once the patient has seen the doctor and collected any medicines."
        />
      </>
    );
  }

  const draft = await tenantDb((tx) =>
    getBillDraft(clinicId, billable.visitId, tx),
  );
  if (!draft) {
    return (
      <>
        <ScreenHeader title="Billing" />
        <EmptyState title="Could not load the bill" />
      </>
    );
  }

  return (
    <BillingScreen
      draft={draft}
      tokenNumber={billable.tokenNumber}
      patientName={billable.patientName}
    />
  );
}
