import { getNursingTasks } from "@/db/queries/tasks";
import { TasksBoard } from "./tasks-board";

/*
 * Always render against current clinic state — a nurse's task list frozen at
 * build time would hide a procedure just ordered. Any page reading mutable
 * clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function TasksPage() {
  const tasks = await getNursingTasks(CLINIC_ID, TODAY);

  return (
    <TasksBoard
      tasks={tasks.map((t) => ({
        ...t,
        orderedAt: t.orderedAt.toISOString(),
      }))}
    />
  );
}
