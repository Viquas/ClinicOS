"use server";

import { revalidatePath } from "next/cache";
import { recordVitals, type RecordVitalsResult } from "@/db/mutations/record-vitals";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000003"; // Latha Bai, nurse

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
  const result = await recordVitals({
    clinicId: CLINIC_ID,
    visitId,
    tokenId,
    actorStaffId: ACTOR_STAFF_ID,
    values,
    skipped,
  });

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/home");
  }
  return result;
}
