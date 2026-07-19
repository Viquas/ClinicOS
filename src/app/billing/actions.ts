"use server";

import { revalidatePath } from "next/cache";
import { recordBill, type RecordBillResult } from "@/db/mutations/record-bill";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import type { BillLine } from "@/lib/billing/gst";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function recordBillAction(input: {
  visitId: string;
  lines: BillLine[];
  mode: "cash" | "upi" | "card";
}): Promise<RecordBillResult> {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "bill:create");
  if (!auth.ok) return auth;

  const result = await recordBill({
    clinicId: CLINIC_ID,
    visitId: input.visitId,
    lines: input.lines,
    mode: input.mode,
    actorStaffId: auth.staff.id,
  });

  if (result.ok) {
    revalidatePath("/billing");
    revalidatePath("/queue");
    revalidatePath("/dashboard");
  }

  return result;
}
