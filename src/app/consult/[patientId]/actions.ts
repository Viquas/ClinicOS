"use server";

import { revalidatePath } from "next/cache";
import {
  recordConsultation,
  type PrescriptionLineInput,
  type RecordConsultationResult,
} from "@/db/mutations/record-consultation";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

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
  const clinicId = await getActiveClinicId();
  /* The actor is whoever is signed in on this device, which is not always
     the treating doctor stored on the visit. doctorId names whose clinical
     record this is; actorStaffId names who actually wrote it. */
  const auth = await requireCurrentStaffCan(clinicId, "consultation:write");
  if (!auth.ok) return auth;

  /* Prescribing is a stricter permission than closing a visit — a visit
     with drug lines needs prescription:write too (§7.8, mirrored by the
     RESTRICTIVE RLS policy on prescriptions). */
  if (lines.length > 0) {
    const rxAuth = await requireCurrentStaffCan(clinicId, "prescription:write");
    if (!rxAuth.ok) return rxAuth;
  }

  const result = await tenantDb((tx) =>
    recordConsultation({
      clinicId,
      visitId,
      tokenId,
      doctorId,
      actorStaffId: auth.staff.id,
      diagnosis,
      advice: advice.trim() || null,
      followUpDate,
      lines,
      executor: tx,
    }),
  );

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/pharmacy");
    revalidatePath("/billing");
    revalidatePath("/home");
  }
  return result;
}
