"use server";

import { revalidatePath } from "next/cache";
import { logWaShare } from "@/db/mutations/log-wa-share";
import { recordVaccineDose } from "@/db/mutations/record-vaccine-dose";
import { getBookableDoctors } from "@/db/queries/queue";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getCurrentStaff } from "@/lib/auth/current-staff";

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

export async function logReminderShareAction(input: {
  toPhone: string;
  patientName: string;
}): Promise<void> {
  try {
    const clinicId = await getActiveClinicId();
    const staff = await getCurrentStaff(clinicId);
    await tenantDb((tx) =>
      logWaShare({
        clinicId,
        toPhone: input.toPhone,
        templateName: "vaccination_reminder_share",
        patientName: input.patientName,
        actorStaffId: staff.id,
        executor: tx,
      }),
    );
  } catch (error) {
    console.error("logReminderShareAction failed", error);
  }
}
