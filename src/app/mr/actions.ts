"use server";

import { revalidatePath } from "next/cache";
import {
  checkInRep,
  logWalkInRep,
  markRepSeen,
} from "@/db/mutations/mr-visit";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000004"; // Rekha, reception

export async function checkInRepAction(mrVisitId: string) {
  const result = await checkInRep({ clinicId: CLINIC_ID, mrVisitId });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function markRepSeenAction(mrVisitId: string, doctorNotes?: string) {
  const result = await markRepSeen({
    clinicId: CLINIC_ID,
    mrVisitId,
    actorStaffId: ACTOR_STAFF_ID,
    doctorNotes,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function logWalkInRepAction(repId: string, doctorId: string) {
  const result = await logWalkInRep({
    clinicId: CLINIC_ID,
    repId,
    doctorId,
    actorStaffId: ACTOR_STAFF_ID,
  });
  if (result.ok) revalidatePath("/mr");
  return result;
}
