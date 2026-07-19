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
import { requireCurrentStaffCan } from "@/lib/auth/guard";

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
  /* Demographics corrections are front-desk work (§7.1) — same permission
     as registering the patient in the first place. */
  const auth = await requireCurrentStaffCan(CLINIC_ID, "patient:register");
  if (!auth.ok) return auth;

  const result = await updatePatientDemographics({
    clinicId: CLINIC_ID,
    patientId,
    actorStaffId: auth.staff.id,
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
  /* Amending is consultation-writing; the mutation additionally restricts
     it to the authoring doctor or the owner. */
  const auth = await requireCurrentStaffCan(CLINIC_ID, "consultation:write");
  if (!auth.ok) return auth;

  const result = await amendConsultation({
    clinicId: CLINIC_ID,
    visitId,
    actorStaffId: auth.staff.id,
    actorRoles: auth.staff.roles,
    reason,
    edits,
  });

  if (result.ok) {
    revalidatePath(`/patients/${patientId}`);
  }
  return result;
}
