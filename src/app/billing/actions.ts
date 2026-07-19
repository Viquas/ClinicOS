"use server";

import { revalidatePath } from "next/cache";
import { recordBill, type RecordBillResult } from "@/db/mutations/record-bill";
import type { BillLine } from "@/lib/billing/gst";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000004";

export async function recordBillAction(input: {
  visitId: string;
  lines: BillLine[];
  mode: "cash" | "upi" | "card";
}): Promise<RecordBillResult> {
  const result = await recordBill({
    clinicId: CLINIC_ID,
    visitId: input.visitId,
    lines: input.lines,
    mode: input.mode,
    actorStaffId: ACTOR_STAFF_ID,
  });

  if (result.ok) {
    revalidatePath("/billing");
    revalidatePath("/queue");
    revalidatePath("/dashboard");
  }

  return result;
}
