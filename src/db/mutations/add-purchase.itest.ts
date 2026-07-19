import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, batches, stockMovements } from "@/db/schema";
import { addPurchase } from "./add-purchase";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const STAFF = "22222222-0000-0000-0000-000000000004";
const PARACETAMOL = "55555555-0000-0000-0000-000000000001";
const TODAY = "2026-07-18";

const created: string[] = [];

afterEach(async () => {
  for (const id of created) {
    await db.delete(auditLog).where(eq(auditLog.entityId, id));
    await db.delete(stockMovements).where(eq(stockMovements.batchId, id));
    await db.delete(batches).where(eq(batches.id, id));
  }
  created.length = 0;
});

const add = (over: Partial<Parameters<typeof addPurchase>[0]> = {}) =>
  addPurchase({
    clinicId: CLINIC,
    itemId: PARACETAMOL,
    batchNo: "NEW-001",
    expiryDate: "2028-03-31",
    quantity: 24,
    costPerUnit: 38.5,
    supplierName: "Mysuru Pharma",
    invoiceNo: "MPD/26-27/2001",
    actorStaffId: STAFF,
    today: TODAY,
    ...over,
  });

describe("addPurchase", () => {
  it("creates a batch with received and remaining equal", async () => {
    const result = await add();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.batchId);

    const [batch] = await db
      .select({
        received: batches.quantityReceived,
        remaining: batches.quantityRemaining,
        expiry: batches.expiryDate,
      })
      .from(batches)
      .where(eq(batches.id, result.batchId));

    expect(Number(batch.received)).toBe(24);
    expect(Number(batch.remaining)).toBe(24);
    expect(batch.expiry).toBe("2028-03-31");
  });

  it("writes a positive purchase movement to the ledger", async () => {
    const result = await add();
    if (!result.ok) return;
    created.push(result.batchId);

    const [movement] = await db
      .select({ kind: stockMovements.kind, delta: stockMovements.quantityDelta })
      .from(stockMovements)
      .where(eq(stockMovements.batchId, result.batchId));

    expect(movement.kind).toBe("purchase");
    expect(Number(movement.delta)).toBe(24);
  });

  it("logs the purchase", async () => {
    const result = await add();
    if (!result.ok) return;
    created.push(result.batchId);

    const [entry] = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, result.batchId));

    expect(entry.action).toBe("purchase_added");
  });

  it("makes the new stock immediately dispensable via FEFO ordering", async () => {
    /* A near-future expiry should sort ahead of the seeded far-future batch,
       so the stock genuinely enters the dispensing rotation. */
    const result = await add({ batchNo: "FEFO-NEW", expiryDate: "2026-09-30" });
    if (!result.ok) return;
    created.push(result.batchId);

    const rows = await db
      .select({ id: batches.id, expiry: batches.expiryDate })
      .from(batches)
      .where(
        and(eq(batches.clinicId, CLINIC), eq(batches.itemId, PARACETAMOL)),
      )
      .orderBy(batches.expiryDate);

    /* Not last — there is at least one seeded batch expiring later. */
    const position = rows.findIndex((r) => r.id === result.batchId);
    expect(position).toBeLessThan(rows.length - 1);
  });

  describe("validation", () => {
    it("refuses a blank batch number", async () => {
      expect(await add({ batchNo: "  " })).toEqual({
        ok: false,
        error: "Enter the batch number",
      });
    });

    it("refuses a malformed expiry", async () => {
      expect(await add({ expiryDate: "March 2028" })).toEqual({
        ok: false,
        error: "Enter the expiry as YYYY-MM-DD",
      });
    });

    it("refuses an expiry in the past — the un-dispensable-stock guard", async () => {
      expect(await add({ expiryDate: "2026-06-30" })).toEqual({
        ok: false,
        error: "Expiry must be a future date",
      });
    });

    it("refuses today as the expiry", async () => {
      /* A batch expiring today cannot be dispensed today (§7.5 inclusive). */
      expect(await add({ expiryDate: TODAY })).toEqual({
        ok: false,
        error: "Expiry must be a future date",
      });
    });

    it("refuses a non-positive quantity", async () => {
      expect((await add({ quantity: 0 })).ok).toBe(false);
      expect((await add({ quantity: -5 })).ok).toBe(false);
    });

    it("refuses an item not in the formulary", async () => {
      expect(
        await add({ itemId: "00000000-0000-0000-0000-000000000000" }),
      ).toEqual({ ok: false, error: "Item not in formulary" });
    });

    it("refuses an item from another clinic's formulary", async () => {
      expect(await add({ clinicId: OTHER_CLINIC })).toEqual({
        ok: false,
        error: "Item not in formulary",
      });
    });

    it("writes nothing when it refuses", async () => {
      const before = await db
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.clinicId, CLINIC));

      await add({ expiryDate: "2020-01-01" });

      const after = await db
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.clinicId, CLINIC));

      expect(after.length).toBe(before.length);
    });
  });

  it("accepts a purchase without optional cost or supplier fields", async () => {
    const result = await add({
      costPerUnit: null,
      supplierName: null,
      invoiceNo: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) created.push(result.batchId);
  });
});
