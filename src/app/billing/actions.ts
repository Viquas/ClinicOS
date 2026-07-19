"use server";

import { revalidatePath } from "next/cache";
import { recordBill, type RecordBillResult } from "@/db/mutations/record-bill";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import type { BillLine } from "@/lib/billing/gst";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function recordBillAction(input: {
  visitId: string;
  lines: BillLine[];
  mode: "cash" | "upi" | "card";
}): Promise<RecordBillResult> {
  /* The audit trail must name whoever is actually signed in — this was a
     hardcoded id from before the role switcher existed, so every bill was
     attributed to the same person regardless of who collected it. */
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await recordBill({
    clinicId: CLINIC_ID,
    visitId: input.visitId,
    lines: input.lines,
    mode: input.mode,
    actorStaffId: currentStaff.id,
  });

  if (result.ok) {
    revalidatePath("/billing");
    revalidatePath("/queue");
    revalidatePath("/dashboard");
  }

  return result;
}
