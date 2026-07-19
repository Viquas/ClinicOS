"use server";

import { revalidatePath } from "next/cache";
import { recordVitals, type RecordVitalsResult } from "@/db/mutations/record-vitals";
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
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "vitals:record");
  if (!auth.ok) return auth;

  const result = await recordVitals({
    clinicId: await getActiveClinicId(),
    visitId,
    tokenId,
    actorStaffId: auth.staff.id,
    values,
    skipped,
  });

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/home");
  }
  return result;
}
