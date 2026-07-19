"use server";

import { revalidatePath } from "next/cache";
import {
  recordConsultation,
  type PrescriptionLineInput,
  type RecordConsultationResult,
} from "@/db/mutations/record-consultation";
import { getCurrentStaff } from "@/lib/auth/current-staff";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function recordConsultationAction({
  visitId,
  tokenId,
  doctorId,
  diagnosis,
  advice,
  followUpDate,
  lines,
}: {
  visitId: string;
  tokenId: string;
  doctorId: string;
  diagnosis: string;
  advice: string;
  followUpDate: string | null;
  lines: PrescriptionLineInput[];
}): Promise<RecordConsultationResult> {
  /* The actor is whoever is signed in on this device, which is not always
     the treating doctor stored on the visit — a nurse can be entering a
     doctor's dictated note. doctorId names whose clinical record this is;
     actorStaffId names who actually wrote it, for the audit trail. */
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await recordConsultation({
    clinicId: CLINIC_ID,
    visitId,
    tokenId,
    doctorId,
    actorStaffId: currentStaff.id,
    diagnosis,
    advice: advice.trim() || null,
    followUpDate,
    lines,
  });

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/pharmacy");
    revalidatePath("/billing");
    revalidatePath("/home");
  }
  return result;
}
