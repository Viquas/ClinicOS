"use server";

import { revalidatePath } from "next/cache";
import { addPurchase, type AddPurchaseResult } from "@/db/mutations/add-purchase";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

const TODAY = "2026-07-18";

export async function addPurchaseAction(input: {
  itemId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPerUnit?: number | null;
  supplierName?: string | null;
  invoiceNo?: string | null;
}): Promise<AddPurchaseResult> {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "inventory:purchase");
  if (!auth.ok) return auth;

  const result = await addPurchase({
    clinicId: await getActiveClinicId(),
    actorStaffId: auth.staff.id,
    today: TODAY,
    ...input,
  });

  if (result.ok) {
    revalidatePath("/inventory");
    revalidatePath("/pharmacy");
    revalidatePath("/dashboard");
  }

  return result;
}
