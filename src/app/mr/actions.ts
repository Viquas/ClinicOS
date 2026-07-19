"use server";

import { revalidatePath } from "next/cache";
import {
  checkInRep,
  logWalkInRep,
  markRepSeen,
} from "@/db/mutations/mr-visit";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";


export async function checkInRepAction(mrVisitId: string) {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "mr:manage");
  if (!auth.ok) return auth;

  const result = await checkInRep({ clinicId: await getActiveClinicId(), mrVisitId });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function markRepSeenAction(mrVisitId: string, doctorNotes?: string) {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "mr:manage");
  if (!auth.ok) return auth;

  const result = await markRepSeen({
    clinicId: await getActiveClinicId(),
    mrVisitId,
    actorStaffId: auth.staff.id,
    doctorNotes,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function logWalkInRepAction(repId: string, doctorId: string) {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "mr:manage");
  if (!auth.ok) return auth;

  const result = await logWalkInRep({
    clinicId: await getActiveClinicId(),
    repId,
    doctorId,
    actorStaffId: auth.staff.id,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}
