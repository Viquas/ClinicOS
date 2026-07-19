"use server";

import { revalidatePath } from "next/cache";
import {
  addStaff,
  setStaffActive,
  updateStaffRoles,
  type AddStaffResult,
  type ManageStaffResult,
} from "@/db/mutations/manage-staff";
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
