import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  batches,
  scheduleH1Register,
  stockMovements,
  visits,
} from "@/db/schema";
import { dispense } from "./dispense";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000004";
const DOCTOR_ID = "33333333-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";
const PARACETAMOL = "55555555-0000-0000-0000-000000000001";
const ONDANSETRON = "55555555-0000-0000-0000-000000000004";

/* Batch ids of our own so the seeded stock is never disturbed. */
const FRESH = "bbbb0000-0000-0000-0000-0000000000f1";
const EXPIRED = "bbbb0000-0000-0000-0000-0000000000e1";
/* All hex — an earlier version used ...000h and Postgres rejected it. */
const H1_BATCH = "bbbb0000-0000-0000-0000-0000000000a1";

const ASOF = new Date("2026-07-18T10:00:00Z");

let visitId: string;

const patient = { id: AARAV, name: "Aarav Prakash", address: "Hunsur" };
const doctor = { name: "Dr. Sameera Rahman", registrationNo: "KMC 78412" };

async function cleanup() {
  for (const id of [FRESH, EXPIRED, H1_BATCH]) {
    await db.delete(stockMovements).where(eq(stockMovements.batchId, id));
    await db.delete(batches).where(eq(batches.id, id));
  }
  await db
    .delete(scheduleH1Register)
    .where(eq(scheduleH1Register.patientId, AARAV));
  if (visitId) {
    await db.delete(auditLog).where(eq(auditLog.entityId, visitId));
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
      doctorId: DOCTOR_ID,
      visitDate: clinicToday(),
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  await db.insert(batches).values([
    {
      id: FRESH,
      clinicId: CLINIC,
      itemId: PARACETAMOL,
      batchNo: "TEST-FRESH",
      expiryDate: "2027-12-31",
      quantityReceived: "20",
      quantityRemaining: "20",
    },
    {
      id: EXPIRED,
      clinicId: CLINIC,
      itemId: PARACETAMOL,
      batchNo: "TEST-EXPIRED",
      expiryDate: "2026-06-30",
      quantityReceived: "20",
      quantityRemaining: "15",
    },
    {
      id: H1_BATCH,
      clinicId: CLINIC,
      itemId: ONDANSETRON,
      batchNo: "TEST-H1",
      expiryDate: "2027-06-30",
      quantityReceived: "50",
      quantityRemaining: "50",
    },
  ]);
});

afterEach(cleanup);

const run = (lines: { batchId: string; quantity: number }[]) =>
  dispense({
    clinicId: CLINIC,
    visitId,
    lines,
    actorStaffId: STAFF,
    patient,
    doctor,
    asOf: ASOF,
  });

const remaining = async (batchId: string = FRESH) => {
  const [row] = await db
    .select({ q: batches.quantityRemaining })
    .from(batches)
    .where(eq(batches.id, batchId));
  return Number(row.q);
};

describe("the expiry block (§7.5)", () => {
  it("refuses an expired batch", async () => {
    const result = await run([{ batchId: EXPIRED, quantity: 1 }]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/i);
  });

  it("does not decrement stock when it refuses", async () => {
    await run([{ batchId: EXPIRED, quantity: 1 }]);
    expect(await remaining(EXPIRED)).toBe(15);
  });

  it("rolls back the whole dispense if any line is expired", async () => {
    /*
     * The case that matters most: a mixed basket where one line is bad. A
     * partial commit would decrement the good line and leave the bill and the
     * shelf disagreeing.
     */
    const result = await run([
      { batchId: FRESH, quantity: 2 },
      { batchId: EXPIRED, quantity: 1 },
    ]);

    expect(result.ok).toBe(false);
    expect(await remaining(FRESH)).toBe(20);
    expect(await remaining(EXPIRED)).toBe(15);
  });
});

describe("stock decrement", () => {
  it("reduces the batch by the dispensed quantity", async () => {
    const result = await run([{ batchId: FRESH, quantity: 3 }]);

    expect(result.ok).toBe(true);
    expect(await remaining(FRESH)).toBe(17);
  });

  it("refuses to dispense more than remains", async () => {
    const result = await run([{ batchId: FRESH, quantity: 999 }]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/only 20 left/i);
    expect(await remaining(FRESH)).toBe(20);
  });

  it("refuses a zero or negative quantity", async () => {
    expect((await run([{ batchId: FRESH, quantity: 0 }])).ok).toBe(false);
    expect((await run([{ batchId: FRESH, quantity: -5 }])).ok).toBe(false);
    expect(await remaining(FRESH)).toBe(20);
  });

  it("writes an append-only ledger entry", async () => {
    await run([{ batchId: FRESH, quantity: 4 }]);

    const [movement] = await db
      .select({
        kind: stockMovements.kind,
        delta: stockMovements.quantityDelta,
      })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, FRESH));

    expect(movement.kind).toBe("dispense");
    expect(Number(movement.delta)).toBe(-4);
  });

  it("keeps the ledger reconciling with the batch quantity", async () => {
    await run([{ batchId: FRESH, quantity: 2 }]);
    await run([{ batchId: FRESH, quantity: 3 }]);

    const movements = await db
      .select({ delta: stockMovements.quantityDelta })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, FRESH));

    const net = movements.reduce((sum, m) => sum + Number(m.delta), 0);
    expect(20 + net).toBe(await remaining(FRESH));
  });
});

describe("concurrent dispensing", () => {
  /*
   * These assert an invariant that holds however the transactions interleave,
   * rather than a specific winner. An earlier version asserted "exactly one
   * of two succeeds" and passed even with the FOR UPDATE lock removed — the
   * window between the read and the write is small enough that two calls
   * usually serialise on their own, so the test proved nothing.
   *
   * concurrency-probe.itest.ts demonstrates the mechanism directly: without
   * the lock a forced interleaving drives the quantity to -10; with it, the
   * second transaction blocks on the read and refuses.
   */
  it("never lets stock go negative under concurrent load", async () => {
    const attempts = Array.from({ length: 8 }, () =>
      run([{ batchId: FRESH, quantity: 3 }]),
    );
    const results = await Promise.all(attempts);

    const succeeded = results.filter((r) => r.ok).length;
    const left = await remaining();

    expect(left).toBeGreaterThanOrEqual(0);
    /* Every success is accounted for exactly once. */
    expect(left).toBe(20 - succeeded * 3);
  });

  it("keeps the ledger consistent with the shelf under concurrent load", async () => {
    await Promise.all([
      run([{ batchId: FRESH, quantity: 4 }]),
      run([{ batchId: FRESH, quantity: 4 }]),
      run([{ batchId: FRESH, quantity: 4 }]),
    ]);

    const movements = await db
      .select({ delta: stockMovements.quantityDelta })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, FRESH));

    const net = movements.reduce((sum, m) => sum + Number(m.delta), 0);
    expect(20 + net).toBe(await remaining());
  });

  it("lets both through when there is genuinely enough stock", async () => {
    const [first, second] = await Promise.all([
      run([{ batchId: FRESH, quantity: 5 }]),
      run([{ batchId: FRESH, quantity: 5 }]),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(await remaining()).toBe(10);
  });
});

describe("Schedule H1 register (§9.3)", () => {
  it("writes a register entry for an H1 drug", async () => {
    await run([{ batchId: H1_BATCH, quantity: 6 }]);

    const [entry] = await db
      .select({
        drugName: scheduleH1Register.drugName,
        batchNo: scheduleH1Register.batchNo,
        quantity: scheduleH1Register.quantity,
        patientName: scheduleH1Register.patientName,
        doctorRegistrationNo: scheduleH1Register.doctorRegistrationNo,
      })
      .from(scheduleH1Register)
      .where(eq(scheduleH1Register.patientId, AARAV));

    expect(entry.drugName).toBe("Ondansetron");
    expect(entry.batchNo).toBe("TEST-H1");
    expect(Number(entry.quantity)).toBe(6);
    expect(entry.patientName).toBe("Aarav Prakash");
    expect(entry.doctorRegistrationNo).toBe("KMC 78412");
  });

  it("does not write a register entry for a non-H1 drug", async () => {
    await run([{ batchId: FRESH, quantity: 2 }]);

    const entries = await db
      .select({ id: scheduleH1Register.id })
      .from(scheduleH1Register)
      .where(eq(scheduleH1Register.patientId, AARAV));

    expect(entries).toEqual([]);
  });

  it("writes no register entry when the dispense is refused", async () => {
    await run([
      { batchId: H1_BATCH, quantity: 6 },
      { batchId: EXPIRED, quantity: 1 },
    ]);

    const entries = await db
      .select({ id: scheduleH1Register.id })
      .from(scheduleH1Register)
      .where(eq(scheduleH1Register.patientId, AARAV));

    /* The statutory record must not claim a dispense that did not happen. */
    expect(entries).toEqual([]);
  });
});

describe("audit", () => {
  it("records the dispense against the visit", async () => {
    await run([{ batchId: FRESH, quantity: 2 }]);

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(and(eq(auditLog.clinicId, CLINIC), eq(auditLog.entityId, visitId)));

    expect(entry.action).toBe("dispensed");
    expect(entry.detail).toMatchObject({
      lines: [{ batchNo: "TEST-FRESH", quantity: 2 }],
    });
  });
});
