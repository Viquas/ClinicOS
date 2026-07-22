"use server";

import { revalidatePath } from "next/cache";
import { logWaShare } from "@/db/mutations/log-wa-share";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getCurrentStaff } from "@/lib/auth/current-staff";

export async function logShareAction(input: {
  templateName:
    | "prescription_share"
    | "bill_receipt_share"
    | "vaccination_reminder_share";
  toPhone: string;
  patientName: string;
}): Promise<void> {
  /* Fire-and-forget from the share button: a failed log line must never
     block the share itself, so errors are swallowed after logging. */
  try {
    const clinicId = await getActiveClinicId();
    const staff = await getCurrentStaff(clinicId);
    await tenantDb((tx) =>
      logWaShare({
        clinicId,
        toPhone: input.toPhone,
        templateName: input.templateName,
        patientName: input.patientName,
        actorStaffId: staff.id,
        executor: tx,
      }),
    );
    revalidatePath("/messages");
  } catch (error) {
    console.error("logShareAction failed", error);
  }
}
