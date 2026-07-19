import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  batches,
  procedures,
  procedureTasks,
  stockMovements,
  visits,
} from "@/db/schema";
import { completeTask, startTask } from "./procedure-task";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000003";
const DOCTOR = "33333333-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";
const PARACETAMOL = "55555555-0000-0000-0000-000000000001";

const FRESH_BATCH = "cccc0000-0000-0000-0000-0000000000f1";
const EXPIRED_BATCH = "cccc0000-0000-0000-0000-0000000000e1";

const ASOF = new Date("2026-07-18T10:00:00Z");

let visitId: string;
let procedureId: string;
let lowStockProcedureId: string;

async function cleanup() {
  await db
    .delete(stockMovements)
    .where(eq(stockMovements.batchId, FRESH_BATCH));
  await db
    .delete(stockMovements)
    .where(eq(stockMovements.batchId, EXPIRED_BATCH));
  await db.delete(batches).where(eq(batches.id, FRESH_BATCH));
  await db.delete(batches).where(eq(batches.id, EXPIRED_BATCH));

  if (procedureId) {
    await db
      .delete(auditLog)
      .where(eq(auditLog.entityTable, "procedure_tasks"));
    await db
      .delete(procedureTasks)
      .where(eq(procedureTasks.procedureId, procedureId));
    await db.delete(procedures).where(eq(procedures.id, procedureId));
  }
  if (lowStockProcedureId) {
    await db
      .delete(procedureTasks)
      .where(eq(procedureTasks.procedureId, lowStockProcedureId));
    await db.delete(procedures).where(eq(procedures.id, lowStockProcedureId));
  }
  if (visitId) {
    await db.delete(visits).where(eq(visits.id, visitId));
  }
}

beforeEach(async () => {
  await cleanup();

  const [visit] = await db
    .insert(visits)
    .values({
      clinicId: CLINIC,
      patientId: AARAV,
      doctorId: DOCTOR,
      visitDate: "2026-07-18",
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  /*
   * Paracetamol is a shared formulary item — FEFO selection competes across
   * every batch under it clinic-wide, including the ones the main seed
   * inserts. TASK-FRESH must expire earlier than every seeded Paracetamol
   * batch (nearest is 2026-08-07) or the seed's own stock wins the FEFO pick
   * instead of the fixture this test is about, and the assertions below would
   * silently be checking the wrong batch.
   */
  await db.insert(batches).values([
    {
      id: FRESH_BATCH,
      clinicId: CLINIC,
      itemId: PARACETAMOL,
      batchNo: "TASK-FRESH",
      expiryDate: "2026-07-20",
      quantityReceived: "20",
      quantityRemaining: "20",
    },
    {
      id: EXPIRED_BATCH,
      clinicId: CLINIC,
      itemId: PARACETAMOL,
      batchNo: "TASK-EXPIRED",
      expiryDate: "2026-06-30",
      quantityReceived: "20",
      quantityRemaining: "20",
    },
  ]);

  const [proc] = await db
    .insert(procedures)
    .values({
      clinicId: CLINIC,
      name: "Test Nebulisation",
      charge: "150.00",
      consumables: [{ itemId: PARACETAMOL, quantity: 2 }],
    })
    .returning({ id: procedures.id });
  procedureId = proc.id;

  const [lowProc] = await db
    .insert(procedures)
    .values({
      clinicId: CLINIC,
      name: "Test Low Stock Procedure",
      charge: "80.00",
      consumables: [{ itemId: PARACETAMOL, quantity: 5 }],
    })
    .returning({ id: procedures.id });
  lowStockProcedureId = lowProc.id;
});

afterEach(cleanup);

async function makeTask(procId: string, state: "pending" | "in_progress" = "pending") {
  const [task] = await db
    .insert(procedureTasks)
    .values({
      clinicId: CLINIC,
      visitId,
      procedureId: procId,
      state,
    })
    .returning({ id: procedureTasks.id });
  return task.id;
}

const remaining = async (batchId: string) => {
  const [row] = await db
    .select({ q: batches.quantityRemaining })
    .from(batches)
    .where(eq(batches.id, batchId));
  return Number(row.q);
};

describe("startTask", () => {
  it("moves a pending task to in_progress and assigns the actor", async () => {
    const taskId = await makeTask(procedureId, "pending");
    const result = await startTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF });

    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ state: procedureTasks.state, assignedToStaffId: procedureTasks.assignedToStaffId })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, taskId));

    expect(row.state).toBe("in_progress");
    expect(row.assignedToStaffId).toBe(STAFF);
  });

  it("refuses to start a task that is not pending", async () => {
    const taskId = await makeTask(procedureId, "in_progress");
    const result = await startTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF });

    expect(result).toEqual({ ok: false, error: "Task is not pending" });
  });
});

describe("completeTask — the second place medicine leaves the shelf", () => {
  it("deducts the nearest-expiry unexpired batch, not the expired one", async () => {
    const taskId = await makeTask(procedureId, "in_progress");
    const result = await completeTask({
      clinicId: CLINIC,
      taskId,
      actorStaffId: STAFF,
      asOf: ASOF,
    });

    expect(result.ok).toBe(true);
    /* Expired batch untouched; fresh batch decremented by the consumable qty. */
    expect(await remaining(EXPIRED_BATCH)).toBe(20);
    expect(await remaining(FRESH_BATCH)).toBe(18);
  });

  it("writes a ledger entry linked to the procedure task, not a visit dispense", async () => {
    const taskId = await makeTask(procedureId, "in_progress");
    await completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF });

    const [movement] = await db
      .select({
        kind: stockMovements.kind,
        delta: stockMovements.quantityDelta,
        procedureTaskId: stockMovements.procedureTaskId,
      })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, FRESH_BATCH));

    expect(movement.kind).toBe("dispense");
    expect(Number(movement.delta)).toBe(-2);
    expect(movement.procedureTaskId).toBe(taskId);
  });

  it("marks the task done with a completion timestamp", async () => {
    const taskId = await makeTask(procedureId, "in_progress");
    await completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF });

    const [row] = await db
      .select({ state: procedureTasks.state, completedAt: procedureTasks.completedAt })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, taskId));

    expect(row.state).toBe("done");
    expect(row.completedAt).not.toBeNull();
  });

  it("logs the completion with the consumables consumed", async () => {
    const taskId = await makeTask(procedureId, "in_progress");
    await completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF });

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, taskId));

    expect(entry.action).toBe("procedure_completed");
    expect(entry.detail).toMatchObject({
      consumables: [{ itemId: PARACETAMOL, quantity: 2 }],
    });
  });

  it("refuses when no batch has enough unexpired stock", async () => {
    /* A procedure whose consumable quantity exceeds every batch's stock,
       fresh or expired — the shortage case. */
    const [hugeProc] = await db
      .insert(procedures)
      .values({
        clinicId: CLINIC,
        name: "Test Huge Consumption",
        charge: "10.00",
        consumables: [{ itemId: PARACETAMOL, quantity: 999 }],
      })
      .returning({ id: procedures.id });

    const taskId = await makeTask(hugeProc.id, "in_progress");
    const result = await completeTask({
      clinicId: CLINIC,
      taskId,
      actorStaffId: STAFF,
      asOf: ASOF,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not enough/i);
    }

    await db.delete(procedureTasks).where(eq(procedureTasks.id, taskId));
    await db.delete(procedures).where(eq(procedures.id, hugeProc.id));
  });

  it("changes nothing when it refuses", async () => {
    const [hugeProc] = await db
      .insert(procedures)
      .values({
        clinicId: CLINIC,
        name: "Test Huge Consumption 2",
        charge: "10.00",
        consumables: [{ itemId: PARACETAMOL, quantity: 999 }],
      })
      .returning({ id: procedures.id });

    const taskId = await makeTask(hugeProc.id, "in_progress");
    await completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF });

    expect(await remaining(FRESH_BATCH)).toBe(20);

    const [row] = await db
      .select({ state: procedureTasks.state })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, taskId));
    expect(row.state).toBe("in_progress");

    await db.delete(procedureTasks).where(eq(procedureTasks.id, taskId));
    await db.delete(procedures).where(eq(procedures.id, hugeProc.id));
  });

  it("refuses to complete an already-completed task", async () => {
    const taskId = await makeTask(procedureId, "in_progress");
    const first = await completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF });
    const second = await completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: "Task is already completed" });
  });

  it("does not double-deduct on a concurrent double-tap", async () => {
    /*
     * On this fast local Postgres, Promise.all often serialises the two
     * db.transaction() calls end-to-end before either overlaps the other's
     * round trip — so this test passes even with the task-row lock removed
     * and cannot, by itself, prove the lock matters. That was verified
     * separately with a forced-interleaving probe (pg_sleep between the
     * state check and the write): without the lock the two calls genuinely
     * overlap and double-deduct; with it, the second sees "done" and refuses.
     * Kept here as a regression guard for the ordinary case.
     */
    const taskId = await makeTask(procedureId, "in_progress");
    const [a, b] = await Promise.all([
      completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF }),
      completeTask({ clinicId: CLINIC, taskId, actorStaffId: STAFF, asOf: ASOF }),
    ]);

    const succeeded = [a, b].filter((r) => r.ok).length;
    expect(succeeded).toBe(1);
    /* Exactly one deduction of 2, never two. */
    expect(await remaining(FRESH_BATCH)).toBe(18);
  });
});
