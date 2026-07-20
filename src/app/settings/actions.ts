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
  updateClinicProfile,
  type ClinicProfileEdits,
  type UpdateClinicProfileResult,
} from "@/db/mutations/update-clinic-profile";
import {
  updateStaffDetails,
  type StaffDetailEdits,
  type UpdateStaffDetailsResult,
} from "@/db/mutations/update-staff-details";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { checkIn, checkOut } from "@/db/mutations/record-attendance";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import type { StaffRole } from "@/lib/auth/claims";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

export async function updateStaffRolesAction(input: {
  staffId: string;
  roles: StaffRole[];
  reason: string;
  specialty?: string;
}): Promise<ManageStaffResult> {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "staff:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    updateStaffRoles({
      clinicId,
      actorStaffId: auth.staff.id,
      actorRoles: auth.staff.roles,
      ...input,
      executor: tx,
    }),
  );

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
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "staff:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    addStaff({
      clinicId,
      actorStaffId: auth.staff.id,
      actorRoles: auth.staff.roles,
      ...input,
      executor: tx,
    }),
  );

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
  const clinicId = await getActiveClinicId();
  const currentStaff = await getCurrentStaff(clinicId);

  const result = await tenantDb((tx) =>
    updateStaffDetails({
      clinicId,
      actorStaffId: currentStaff.id,
      actorRoles: currentStaff.roles,
      ...input,
      executor: tx,
    }),
  );

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
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "staff:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    setStaffActive({
      clinicId,
      actorStaffId: auth.staff.id,
      actorRoles: auth.staff.roles,
      ...input,
      executor: tx,
    }),
  );

  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function updateClinicProfileAction(input: {
  reason: string;
  edits: ClinicProfileEdits;
}): Promise<UpdateClinicProfileResult> {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "settings:manage");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    updateClinicProfile({
      clinicId,
      actorStaffId: auth.staff.id,
      actorRoles: auth.staff.roles,
      ...input,
      executor: tx,
    }),
  );

  if (result.ok) {
    revalidatePath("/settings");
    /* The nav header prints the clinic name, so every screen is stale. */
    revalidatePath("/", "layout");
  }
  return result;
}

/**
 * Attendance is owner-or-self, so this resolves the identity rather than
 * demanding staff:manage — a nurse tapping herself in must not need the owner.
 */
export async function recordAttendanceAction(input: {
  staffId: string;
  direction: "in" | "out";
}) {
  const clinicId = await getActiveClinicId();
  const currentStaff = await getCurrentStaff(clinicId);

  const args = {
    clinicId,
    staffId: input.staffId,
    actorStaffId: currentStaff.id,
    actorIsOwner: currentStaff.roles.includes("owner"),
    today: clinicToday(),
  };

  const result = await tenantDb((tx) =>
    input.direction === "in"
      ? checkIn({ ...args, executor: tx })
      : checkOut({ ...args, executor: tx }),
  );

  if (result.ok) revalidatePath("/settings");
  return result;
}
