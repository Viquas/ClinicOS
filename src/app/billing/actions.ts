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
  discount?: { amountPaise: number; reason: string };
}): Promise<RecordBillResult> {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "bill:create");
  if (!auth.ok) return auth;

  /* A discount is a separate, owner-only grant on top of billing. The server
     is the gate: front desk can record a bill but never one with money taken
     off it, whatever the client sends. */
  const hasDiscount = Boolean(input.discount && input.discount.amountPaise > 0);
  if (hasDiscount) {
    const discountAuth = await requireCurrentStaffCan(clinicId, "bill:discount");
    if (!discountAuth.ok) return discountAuth;
  }

  const result = await tenantDb((tx) =>
    recordBill({
      clinicId,
      visitId: input.visitId,
      lines: input.lines,
      mode: input.mode,
      actorStaffId: auth.staff.id,
      discount: hasDiscount ? input.discount : undefined,
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
