"use server";

import { revalidatePath } from "next/cache";
import { addPurchase, type AddPurchaseResult } from "@/db/mutations/add-purchase";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000004";
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
  const result = await addPurchase({
    clinicId: CLINIC_ID,
    actorStaffId: ACTOR_STAFF_ID,
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
