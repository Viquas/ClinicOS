"use server";

import { revalidatePath } from "next/cache";
import {
  addStaff,
  setStaffActive,
  updateStaffRoles,
  type AddStaffResult,
  type ManageStaffResult,
} from "@/db/mutations/manage-staff";
import {
  updateStaffDetails,
  type StaffDetailEdits,
  type UpdateStaffDetailsResult,
} from "@/db/mutations/update-staff-details";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import type { StaffRole } from "@/lib/auth/claims";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function updateStaffRolesAction(input: {
  staffId: string;
  roles: StaffRole[];
  reason: string;
  specialty?: string;
}): Promise<ManageStaffResult> {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "staff:manage");
  if (!auth.ok) return auth;

  const result = await updateStaffRoles({
    clinicId: CLINIC_ID,
    actorStaffId: auth.staff.id,
    actorRoles: auth.staff.roles,
    ...input,
  });

  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/home");
  }
  return result;
}

export async function addStaffAction(input: {
  name: string;
  phone: string;
  roles: StaffRole[];
  qualification?: string | null;
  specialty?: string;
}): Promise<AddStaffResult> {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "staff:manage");
  if (!auth.ok) return auth;

  const result = await addStaff({
    clinicId: CLINIC_ID,
    actorStaffId: auth.staff.id,
    actorRoles: auth.staff.roles,
    ...input,
  });

  if (result.ok) revalidatePath("/settings");
  return result;
}

/**
 * Profile details, unlike roles, are not owner-only: a doctor entering their
 * own council registration is the normal path (§9.2). The mutation decides
 * owner-or-self, so this resolves the identity without demanding
 * staff:manage — otherwise a doctor could never unblock their own prescribing.
 */
export async function updateStaffDetailsAction(input: {
  staffId: string;
  reason: string;
  edits: StaffDetailEdits;
}): Promise<UpdateStaffDetailsResult> {
  const currentStaff = await getCurrentStaff(CLINIC_ID);

  const result = await updateStaffDetails({
    clinicId: CLINIC_ID,
    actorStaffId: currentStaff.id,
    actorRoles: currentStaff.roles,
    ...input,
  });

  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/home");
  }
  return result;
}

export async function setStaffActiveAction(input: {
  staffId: string;
  active: boolean;
  reason: string;
}): Promise<ManageStaffResult> {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "staff:manage");
  if (!auth.ok) return auth;

  const result = await setStaffActive({
    clinicId: CLINIC_ID,
    actorStaffId: auth.staff.id,
    actorRoles: auth.staff.roles,
    ...input,
  });

  if (result.ok) revalidatePath("/settings");
  return result;
}
