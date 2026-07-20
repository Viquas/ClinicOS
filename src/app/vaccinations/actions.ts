"use server";

import { revalidatePath } from "next/cache";
import { recordVaccineDose } from "@/db/mutations/record-vaccine-dose";
import { getBookableDoctors } from "@/db/queries/queue";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

/**
 * A dose is given by a nurse but supervised by a doctor, and the record has
 * to name which one — it used to hardcode Dr Sameera, which is merely wrong
 * rather than obviously wrong in a clinic with two doctors.
 *
 * The doctor id is re-validated here rather than trusted from the client: it
 * arrives from a select, and a select is only a suggestion.
 */
export async function recordDoseAction(
  patientId: string,
  doseId: string,
  doctorId: string,
) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "procedure:execute");
  if (!auth.ok) return auth;

  const bookable = await tenantDb((tx) => getBookableDoctors(clinicId, tx));
  if (!bookable.some((d) => d.id === doctorId)) {
    return { ok: false as const, error: "Pick a doctor to supervise this dose" };
  }

  const result = await tenantDb((tx) =>
    recordVaccineDose({
      clinicId,
      patientId,
      doseId,
      doctorId,
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
