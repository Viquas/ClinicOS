import { ScreenHeader } from "@/components/screen-header";
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

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function BillingPage() {
  const billable = await getBillableVisit(CLINIC_ID, TODAY);

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

  const draft = await getBillDraft(CLINIC_ID, billable.visitId);
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
