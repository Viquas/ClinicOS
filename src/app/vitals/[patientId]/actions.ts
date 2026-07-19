"use server";

import { revalidatePath } from "next/cache";
import {
  recordVitals,
  type RecordVitalsResult,
} from "@/db/mutations/record-vitals";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

export async function recordVitalsAction({
  visitId,
  tokenId,
  values,
  skipped,
}: {
  visitId: string;
  tokenId: string;
  values: Record<string, number>;
  skipped: string[];
}): Promise<RecordVitalsResult> {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "vitals:record");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    recordVitals({
      clinicId,
      visitId,
      tokenId,
      actorStaffId: auth.staff.id,
      values,
      skipped,
      executor: tx,
    }),
  );

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/home");
  }
  return result;
}
