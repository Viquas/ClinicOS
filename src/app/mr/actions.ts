"use server";

import { revalidatePath } from "next/cache";
import {
  checkInRep,
  logWalkInRep,
  markRepSeen,
} from "@/db/mutations/mr-visit";
import { getCurrentStaff } from "@/lib/auth/current-staff";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function checkInRepAction(mrVisitId: string) {
  const result = await checkInRep({ clinicId: CLINIC_ID, mrVisitId });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function markRepSeenAction(mrVisitId: string, doctorNotes?: string) {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await markRepSeen({
    clinicId: CLINIC_ID,
    mrVisitId,
    actorStaffId: currentStaff.id,
    doctorNotes,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function logWalkInRepAction(repId: string, doctorId: string) {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await logWalkInRep({
    clinicId: CLINIC_ID,
    repId,
    doctorId,
    actorStaffId: currentStaff.id,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}
