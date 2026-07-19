"use server";

import { revalidatePath } from "next/cache";
import {
  mergePatientRecords,
  type MergeResult,
} from "@/db/mutations/merge-patients";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

/**
 * Thin wrapper: the merge itself lives in db/mutations so it can be tested
 * against a real database. This adds only the request-scoped concern.
 */
export async function mergePatients(
  survivorId: string,
  duplicateId: string,
): Promise<MergeResult> {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "patient:merge");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    mergePatientRecords({
      clinicId,
      actorStaffId: auth.staff.id,
      survivorId,
      duplicateId,
      executor: tx,
    }),
  );

  if (result.ok) revalidatePath("/patients");
  return result;
}
