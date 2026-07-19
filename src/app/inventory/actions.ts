"use server";

import { revalidatePath } from "next/cache";
import { addPurchase, type AddPurchaseResult } from "@/db/mutations/add-purchase";
import { getCurrentStaff } from "@/lib/auth/current-staff";

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
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await addPurchase({
    clinicId: CLINIC_ID,
    actorStaffId: currentStaff.id,
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
