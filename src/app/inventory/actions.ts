"use server";

import { revalidatePath } from "next/cache";
import { addPurchase, type AddPurchaseResult } from "@/db/mutations/add-purchase";
import { requireCurrentStaffCan } from "@/lib/auth/guard";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
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
  const auth = await requireCurrentStaffCan(CLINIC_ID, "inventory:purchase");
  if (!auth.ok) return auth;

  const result = await addPurchase({
    clinicId: CLINIC_ID,
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
