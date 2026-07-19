"use server";

import { revalidatePath } from "next/cache";
import { completeTask, startTask } from "@/db/mutations/procedure-task";
import { tenantDb } from "@/db/tenant-db";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";

export async function startTaskAction(taskId: string) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "procedure:execute");
  if (!auth.ok) return auth;

  const result = await tenantDb((tx) =>
    startTask({
      clinicId,
      taskId,
      actorStaffId: auth.staff.id,
      executor: tx,
    }),
  );
  if (result.ok) revalidatePath("/tasks");
  return result;
}

export async function completeTaskAction(taskId: string) {
  const clinicId = await getActiveClinicId();
  const auth = await requireCurrentStaffCan(clinicId, "procedure:execute");
  if (!auth.ok) return auth;

  const result = await completeTask({
    clinicId: await getActiveClinicId(),
    taskId,
    actorStaffId: auth.staff.id,
    asOf: new Date(),
  });
  if (result.ok) {
    revalidatePath("/tasks");
    revalidatePath("/inventory");
    revalidatePath("/billing");
    revalidatePath("/dashboard");
  }
  return result;
}
