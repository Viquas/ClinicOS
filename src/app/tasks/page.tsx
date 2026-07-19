import { getNursingTasks } from "@/db/queries/tasks";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { TasksBoard } from "./tasks-board";

/*
 * Always render against current clinic state — a nurse's task list frozen at
 * build time would hide a procedure just ordered. Any page reading mutable
 * clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

const TODAY = "2026-07-18";

export default async function TasksPage() {
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/tasks");
  const tasks = await tenantDb((tx) => getNursingTasks(clinicId, TODAY, tx));

  return (
    <TasksBoard
      tasks={tasks.map((t) => ({
        ...t,
        orderedAt: t.orderedAt.toISOString(),
      }))}
    />
  );
}
