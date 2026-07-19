"use server";

import { revalidatePath } from "next/cache";
import { dispense, type DispenseResult } from "@/db/mutations/dispense";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000004";

export async function dispenseAction(input: {
  visitId: string;
  lines: { batchId: string; quantity: number }[];
  patient: { id: string; name: string };
  doctor: { name: string; registrationNo: string | null };
}): Promise<DispenseResult> {
  const result = await dispense({
    clinicId: CLINIC_ID,
    visitId: input.visitId,
    lines: input.lines,
    actorStaffId: ACTOR_STAFF_ID,
    patient: input.patient,
    doctor: input.doctor,
    /* Real clock: the expiry check must reflect the moment of dispensing. */
    asOf: new Date(),
  });

  if (result.ok) {
    revalidatePath("/pharmacy");
    revalidatePath("/inventory");
  }

  return result;
}
