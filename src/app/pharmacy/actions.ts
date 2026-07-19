"use server";

import { revalidatePath } from "next/cache";
import { dispense, type DispenseResult } from "@/db/mutations/dispense";
import { getCurrentStaff } from "@/lib/auth/current-staff";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function dispenseAction(input: {
  visitId: string;
  lines: { batchId: string; quantity: number }[];
  patient: { id: string; name: string };
  doctor: { name: string; registrationNo: string | null };
}): Promise<DispenseResult> {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await dispense({
    clinicId: CLINIC_ID,
    visitId: input.visitId,
    lines: input.lines,
    actorStaffId: currentStaff.id,
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
