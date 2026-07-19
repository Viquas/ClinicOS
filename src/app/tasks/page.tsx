import { getNursingTasks } from "@/db/queries/tasks";
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
  await requireRouteAccess(await getActiveClinicId(), "/tasks");
  const tasks = await getNursingTasks(await getActiveClinicId(), TODAY);

  return (
    <TasksBoard
      tasks={tasks.map((t) => ({
        ...t,
        orderedAt: t.orderedAt.toISOString(),
      }))}
    />
  );
}
