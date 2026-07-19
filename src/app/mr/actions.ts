"use server";

import { revalidatePath } from "next/cache";
import {
  checkInRep,
  logWalkInRep,
  markRepSeen,
} from "@/db/mutations/mr-visit";
import { requireCurrentStaffCan } from "@/lib/auth/guard";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function checkInRepAction(mrVisitId: string) {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "mr:manage");
  if (!auth.ok) return auth;

  const result = await checkInRep({ clinicId: CLINIC_ID, mrVisitId });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function markRepSeenAction(mrVisitId: string, doctorNotes?: string) {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "mr:manage");
  if (!auth.ok) return auth;

  const result = await markRepSeen({
    clinicId: CLINIC_ID,
    mrVisitId,
    actorStaffId: auth.staff.id,
    doctorNotes,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function logWalkInRepAction(repId: string, doctorId: string) {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "mr:manage");
  if (!auth.ok) return auth;

  const result = await logWalkInRep({
    clinicId: CLINIC_ID,
    repId,
    doctorId,
    actorStaffId: auth.staff.id,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}
