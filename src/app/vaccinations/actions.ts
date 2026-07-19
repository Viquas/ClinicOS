"use server";

import { revalidatePath } from "next/cache";
import { recordVaccineDose } from "@/db/mutations/record-vaccine-dose";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

/* The supervising doctor for a nurse-given dose — stays a clinic default
   until a doctor picker lands on the vaccination screen. Distinct from the
   ACTOR, which must be whoever is actually signed in. */
const DEFAULT_DOCTOR_ID = "33333333-0000-0000-0000-000000000001"; // Dr Sameera Rahman, pediatrics

export async function recordDoseAction(patientId: string, doseId: string) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "procedure:execute");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    recordVaccineDose({
      clinicId,
      patientId,
      doseId,
      doctorId: DEFAULT_DOCTOR_ID,
      actorStaffId: auth.staff.id,
      executor: tx,
    }),
  );

  if (result.ok) {
    revalidatePath("/vaccinations");
    revalidatePath("/patients");
  }
  return result;
}
