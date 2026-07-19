"use server";

import { revalidatePath } from "next/cache";
import {
  mergePatientRecords,
  type MergeResult,
} from "@/db/mutations/merge-patients";
import { getCurrentStaff } from "@/lib/auth/current-staff";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Thin wrapper: the merge itself lives in db/mutations so it can be tested
 * against a real database. This adds only the request-scoped concern.
 */
export async function mergePatients(
  survivorId: string,
  duplicateId: string,
): Promise<MergeResult> {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await mergePatientRecords({
    clinicId: CLINIC_ID,
    actorStaffId: currentStaff.id,
    survivorId,
    duplicateId,
  });

  if (result.ok) revalidatePath("/patients");
  return result;
}
