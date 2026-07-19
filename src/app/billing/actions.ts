"use server";

import { revalidatePath } from "next/cache";
import { recordBill, type RecordBillResult } from "@/db/mutations/record-bill";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import type { BillLine } from "@/lib/billing/gst";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

export async function recordBillAction(input: {
  visitId: string;
  lines: BillLine[];
  mode: "cash" | "upi" | "card";
}): Promise<RecordBillResult> {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "bill:create");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    recordBill({
      clinicId,
      visitId: input.visitId,
      lines: input.lines,
      mode: input.mode,
      actorStaffId: auth.staff.id,
      executor: tx,
    }),
  );

  if (result.ok) {
    revalidatePath("/billing");
    revalidatePath("/queue");
    revalidatePath("/dashboard");
  }

  return result;
}
