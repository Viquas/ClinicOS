"use server";

import { revalidatePath } from "next/cache";
import { clinicToday } from "@/lib/clinic-date";
import {
  addPurchase,
  type AddPurchaseResult,
} from "@/db/mutations/add-purchase";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";


export async function addPurchaseAction(input: {
  itemId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPerUnit?: number | null;
  supplierName?: string | null;
  invoiceNo?: string | null;
}): Promise<AddPurchaseResult> {
  const TODAY = clinicToday();
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "inventory:purchase");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    addPurchase({
      clinicId,
      actorStaffId: auth.staff.id,
      today: TODAY,
      ...input,
      executor: tx,
    }),
  );

  if (result.ok) {
    revalidatePath("/inventory");
    revalidatePath("/pharmacy");
    revalidatePath("/dashboard");
  }

  return result;
}
