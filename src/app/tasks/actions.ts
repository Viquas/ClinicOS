"use server";

import { revalidatePath } from "next/cache";
import { completeTask, startTask } from "@/db/mutations/procedure-task";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000003"; // Latha Bai, nurse

export async function startTaskAction(taskId: string) {
  const result = await startTask({
    clinicId: CLINIC_ID,
    taskId,
    actorStaffId: ACTOR_STAFF_ID,
  });
  if (result.ok) revalidatePath("/tasks");
  return result;
}

export async function completeTaskAction(taskId: string) {
  const result = await completeTask({
    clinicId: CLINIC_ID,
    taskId,
    actorStaffId: ACTOR_STAFF_ID,
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
