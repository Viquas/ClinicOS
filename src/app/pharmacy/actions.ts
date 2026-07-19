"use server";

import { revalidatePath } from "next/cache";
import { dispense, type DispenseResult } from "@/db/mutations/dispense";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";


export async function dispenseAction(input: {
  visitId: string;
  lines: { batchId: string; quantity: number }[];
  patient: { id: string; name: string };
  doctor: { name: string; registrationNo: string | null };
}): Promise<DispenseResult> {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "prescription:dispense");
  if (!auth.ok) return auth;

  const result = await dispense({
    clinicId: await getActiveClinicId(),
    visitId: input.visitId,
    lines: input.lines,
    actorStaffId: auth.staff.id,
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
