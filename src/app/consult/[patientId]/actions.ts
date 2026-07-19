"use server";

import { revalidatePath } from "next/cache";
import {
  recordConsultation,
  type PrescriptionLineInput,
  type RecordConsultationResult,
} from "@/db/mutations/record-consultation";
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
  /* The actor is whoever is signed in on this device, which is not always
     the treating doctor stored on the visit. doctorId names whose clinical
     record this is; actorStaffId names who actually wrote it. */
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "consultation:write");
  if (!auth.ok) return auth;

  /* Prescribing is a stricter permission than closing a visit — a visit
     with drug lines needs prescription:write too (§7.8, mirrored by the
     RESTRICTIVE RLS policy on prescriptions). */
  if (lines.length > 0) {
    const rxAuth = await requireCurrentStaffCan(await getActiveClinicId(), "prescription:write");
    if (!rxAuth.ok) return rxAuth;
  }

  const result = await recordConsultation({
    clinicId: await getActiveClinicId(),
    visitId,
    tokenId,
    doctorId,
    actorStaffId: auth.staff.id,
    diagnosis,
    advice: advice.trim() || null,
    followUpDate,
    lines,
  });

  if (result.ok) {
    revalidatePath("/queue");
    revalidatePath("/pharmacy");
    revalidatePath("/billing");
    revalidatePath("/home");
  }
  return result;
}
