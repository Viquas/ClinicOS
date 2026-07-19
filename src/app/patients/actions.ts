"use server";

import { revalidatePath } from "next/cache";
import {
  mergePatientRecords,
  type MergeResult,
} from "@/db/mutations/merge-patients";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000004";

/**
 * Thin wrapper: the merge itself lives in db/mutations so it can be tested
 * against a real database. This adds only the request-scoped concern.
 */
export async function mergePatients(
  survivorId: string,
  duplicateId: string,
): Promise<MergeResult> {
  const result = await mergePatientRecords({
    clinicId: CLINIC_ID,
    actorStaffId: ACTOR_STAFF_ID,
    survivorId,
    duplicateId,
  });

  if (result.ok) revalidatePath("/patients");
  return result;
}
