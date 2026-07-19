"use server";

import { revalidatePath } from "next/cache";
import { recordVaccineDose } from "@/db/mutations/record-vaccine-dose";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000003"; // Latha Bai, nurse
const DEFAULT_DOCTOR_ID = "33333333-0000-0000-0000-000000000001"; // Dr Sameera Rahman, pediatrics

export async function recordDoseAction(patientId: string, doseId: string) {
  const result = await recordVaccineDose({
    clinicId: CLINIC_ID,
    patientId,
    doseId,
    doctorId: DEFAULT_DOCTOR_ID,
    actorStaffId: ACTOR_STAFF_ID,
  });

  if (result.ok) {
    revalidatePath("/vaccinations");
    revalidatePath("/patients");
  }
  return result;
}
