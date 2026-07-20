"use server";

import { revalidatePath } from "next/cache";
import { addRep, archiveRep } from "@/db/mutations/manage-reps";
import { checkInRep, logWalkInRep, markRepSeen } from "@/db/mutations/mr-visit";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

export async function checkInRepAction(mrVisitId: string) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "mr:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    checkInRep({
      clinicId,
      mrVisitId,
      executor: tx,
    }),
  );
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function markRepSeenAction(
  mrVisitId: string,
  doctorNotes?: string,
) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "mr:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    markRepSeen({
      clinicId,
      mrVisitId,
      actorStaffId: auth.staff.id,
      doctorNotes,
      executor: tx,
    }),
  );
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function logWalkInRepAction(repId: string, doctorId: string) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "mr:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    logWalkInRep({
      clinicId,
      repId,
      doctorId,
      actorStaffId: auth.staff.id,
      executor: tx,
    }),
  );
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function addRepAction(input: {
  name: string;
  companyName: string;
  phone?: string | null;
  division?: string | null;
}) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "mr:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    addRep({
      clinicId,
      actorStaffId: auth.staff.id,
      ...input,
      executor: tx,
    }),
  );
  if (result.ok) revalidatePath("/mr");
  return result;
}

export async function archiveRepAction(repId: string) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "mr:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    archiveRep({
      clinicId,
      repId,
      actorStaffId: auth.staff.id,
      executor: tx,
    }),
  );
  if (result.ok) revalidatePath("/mr");
  return result;
}
