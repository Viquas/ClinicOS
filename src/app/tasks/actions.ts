"use server";

import { revalidatePath } from "next/cache";
import { completeTask, startTask } from "@/db/mutations/procedure-task";
import { requireCurrentStaffCan } from "@/lib/auth/guard";
import { getActiveClinicId } from "@/lib/auth/current-clinic";


export async function startTaskAction(taskId: string) {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "procedure:execute");
  if (!auth.ok) return auth;

  const result = await startTask({
    clinicId: await getActiveClinicId(),
    taskId,
    actorStaffId: auth.staff.id,
  });
  if (result.ok) revalidatePath("/tasks");
  return result;
}

export async function completeTaskAction(taskId: string) {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "procedure:execute");
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
