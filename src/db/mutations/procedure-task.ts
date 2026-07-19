import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, procedures, procedureTasks } from "@/db/schema";

/**
 * Procedure task lifecycle (§7.6): pending → in_progress → done.
 *
 * Completing a task is the second place (after pharmacy dispense) where
 * medicine leaves the shelf, so it carries the same guarantees: the batch
 * consumed is chosen and locked inside the transaction — not read on the
 * screen and trusted — expired stock is refused, and the movement lands in
 * the same append-only ledger. Unlike pharmacy dispensing, the operator does
 * not pick a batch; the procedure's consumable list is fixed, so this
 * function does the FEFO selection itself.
 */

export type TaskResult =
  | { ok: true }
  | { ok: false; error: string };

export async function startTask({
  clinicId,
  taskId,
  actorStaffId,
  executor = db,
}: {
  clinicId: string;
  taskId: string;
  actorStaffId: string | null;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<TaskResult> {
  const result = await executor
    .update(procedureTasks)
    .set({
      state: "in_progress",
      assignedToStaffId: actorStaffId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(procedureTasks.clinicId, clinicId),
        eq(procedureTasks.id, taskId),
        eq(procedureTasks.state, "pending"),
      ),
    )
    .returning({ id: procedureTasks.id });

  if (result.length === 0) {
    return { ok: false, error: "Task is not pending" };
  }
  return { ok: true };
}

class TaskError extends Error {}

export async function completeTask({
  clinicId,
  taskId,
  actorStaffId,
  asOf,
  executor = db,
}: {
  clinicId: string;
  taskId: string;
  actorStaffId: string | null;
  asOf: Date;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<TaskResult> {
  const today = asOf.toISOString().slice(0, 10);

  try {
    return await executor.transaction(async (tx) => {
      /*
       * FOR UPDATE on the task row itself, not just the batch: without this,
       * two concurrent completions of the same task both read state as
       * "in_progress" before either commits, both pass the "not done" check,
       * and both deduct — a double-tap that consumes the consumable twice for
       * one procedure. Locking here makes the second call block until the
       * first commits, then it re-reads state as "done" and refuses.
       */
      const taskRows = await tx.execute<{
        id: string;
        visit_id: string;
        state: string;
        procedure_id: string;
      }>(sql`
        select id, visit_id, state, procedure_id
          from procedure_tasks
         where id = ${taskId} and clinic_id = ${clinicId}
         for update
      `);

      const task = taskRows[0];
      if (!task) throw new TaskError("Task not found");
      if (task.state === "done") {
        throw new TaskError("Task is already completed");
      }

      const [procedure] = await tx
        .select({ consumables: procedures.consumables })
        .from(procedures)
        .where(eq(procedures.id, task.procedure_id));

      const consumables = procedure?.consumables ?? [];

      for (const { itemId, quantity } of consumables) {
        /*
         * FOR UPDATE on the FEFO row: the nearest-expiry unexpired batch with
         * enough stock, locked so a concurrent dispense or completion cannot
         * read the same quantity twice. If nothing qualifies, refuse — a
         * consumable running out mid-procedure is real and must surface, not
         * silently skip.
         */
        const rows = await tx.execute<{
          id: string;
          batch_no: string;
          quantity_remaining: string;
        }>(sql`
          select id, batch_no, quantity_remaining
            from batches
           where item_id = ${itemId}
             and clinic_id = ${clinicId}
             and archived_at is null
             and expiry_date > ${today}
             and quantity_remaining >= ${quantity}
           order by expiry_date asc
           limit 1
           for update
        `);

        const batch = rows[0];
        if (!batch) {
          throw new TaskError(
            "Not enough unexpired stock to complete this procedure",
          );
        }

        await tx.execute(sql`
          update batches
             set quantity_remaining = quantity_remaining - ${quantity},
                 updated_at = now()
           where id = ${batch.id}
        `);

        await tx.execute(sql`
          insert into stock_movements
            (clinic_id, batch_id, kind, quantity_delta, procedure_task_id, by_staff_id)
          values
            (${clinicId}, ${batch.id}, 'dispense', ${-quantity}, ${taskId}, ${actorStaffId})
        `);
      }

      await tx
        .update(procedureTasks)
        .set({ state: "done", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(procedureTasks.id, taskId));

      await tx.insert(auditLog).values({
        clinicId,
        actorStaffId,
        action: "procedure_completed",
        entityTable: "procedure_tasks",
        entityId: taskId,
        detail: { consumables },
      });

      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof TaskError) {
      return { ok: false, error: error.message };
    }
    console.error("completeTask failed", error);
    return { ok: false, error: "Could not complete the task" };
  }
}
