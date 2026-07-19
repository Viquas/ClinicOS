"use server";

import { revalidatePath } from "next/cache";
import { completeTask, startTask } from "@/db/mutations/procedure-task";
import { requireCurrentStaffCan } from "@/lib/auth/guard";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function startTaskAction(taskId: string) {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "procedure:execute");
  if (!auth.ok) return auth;

  const result = await startTask({
    clinicId: CLINIC_ID,
    taskId,
    actorStaffId: auth.staff.id,
  });
  if (result.ok) revalidatePath("/tasks");
  return result;
}

export async function completeTaskAction(taskId: string) {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "procedure:execute");
  if (!auth.ok) return auth;

  const result = await completeTask({
    clinicId: CLINIC_ID,
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
