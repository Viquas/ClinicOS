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
import { getActiveClinicId } from "@/lib/auth/current-clinic";


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
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "patient:register");
  if (!auth.ok) return auth;

  const result = await updatePatientDemographics({
    clinicId: await getActiveClinicId(),
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
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "consultation:write");
  if (!auth.ok) return auth;

  const result = await amendConsultation({
    clinicId: await getActiveClinicId(),
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
