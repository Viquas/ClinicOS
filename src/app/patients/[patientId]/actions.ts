"use server";

import { revalidatePath } from "next/cache";
import {
  amendConsultation,
  type AmendConsultationResult,
  type ConsultationEdits,
} from "@/db/mutations/amend-consultation";
import {
  updatePatientDemographics,
  type PatientEdits,
  type UpdatePatientResult,
} from "@/db/mutations/update-patient";
import { getCurrentStaff } from "@/lib/auth/current-staff";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function updatePatientAction({
  patientId,
  reason,
  edits,
}: {
  patientId: string;
  reason: string;
  edits: PatientEdits;
}): Promise<UpdatePatientResult> {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await updatePatientDemographics({
    clinicId: CLINIC_ID,
    patientId,
    actorStaffId: currentStaff.id,
    reason,
    edits,
  });

  if (result.ok) {
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/patients");
  }
  return result;
}

export async function amendConsultationAction({
  patientId,
  visitId,
  reason,
  edits,
}: {
  patientId: string;
  visitId: string;
  reason: string;
  edits: ConsultationEdits;
}): Promise<AmendConsultationResult> {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await amendConsultation({
    clinicId: CLINIC_ID,
    visitId,
    actorStaffId: currentStaff.id,
    actorRoles: currentStaff.roles,
    reason,
    edits,
  });

  if (result.ok) {
    revalidatePath(`/patients/${patientId}`);
  }
  return result;
}
