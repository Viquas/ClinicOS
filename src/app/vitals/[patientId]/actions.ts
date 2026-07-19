"use server";

import { revalidatePath } from "next/cache";
import { recordVitals, type RecordVitalsResult } from "@/db/mutations/record-vitals";
import { getCurrentStaff } from "@/lib/auth/current-staff";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

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
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await recordVitals({
    clinicId: CLINIC_ID,
    visitId,
    tokenId,
    actorStaffId: currentStaff.id,
    values,
    skipped,
  });

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/home");
  }
  return result;
}
