"use server";

import { revalidatePath } from "next/cache";
import { recordVaccineDose } from "@/db/mutations/record-vaccine-dose";
import { requireCurrentStaffCan } from "@/lib/auth/guard";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
/* The supervising doctor for a nurse-given dose — stays a clinic default
   until a doctor picker lands on the vaccination screen. Distinct from the
   ACTOR, which must be whoever is actually signed in. */
const DEFAULT_DOCTOR_ID = "33333333-0000-0000-0000-000000000001"; // Dr Sameera Rahman, pediatrics

export async function recordDoseAction(patientId: string, doseId: string) {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "procedure:execute");
  if (!auth.ok) return auth;

  const result = await recordVaccineDose({
    clinicId: CLINIC_ID,
    patientId,
    doseId,
    doctorId: DEFAULT_DOCTOR_ID,
    actorStaffId: auth.staff.id,
  });

  if (result.ok) {
    revalidatePath("/vaccinations");
    revalidatePath("/patients");
  }
  return result;
}
