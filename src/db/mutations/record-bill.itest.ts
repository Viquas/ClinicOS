import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  billItems,
  bills,
  payments,
  tokens,
  visits,
} from "@/db/schema";
import type { BillLine } from "@/lib/billing/gst";
import { recordBill } from "./record-bill";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const STAFF = "22222222-0000-0000-0000-000000000004";
const MANJUNATH = "44444444-0000-0000-0000-000000000004";
const DOCTOR = "33333333-0000-0000-0000-000000000002";

let visitId: string;

const LINES: BillLine[] = [
  {
    description: "Consultation",
    kind: "service",
    quantity: 1,
    unitPaise: 30000,
    gstRate: 0,
  },
  {
    description: "Paracetamol Syrup",
    kind: "goods",
    quantity: 2,
    unitPaise: 5600,
    gstRate: 12,
  },
];

async function cleanup() {
  if (!visitId) return;
  const billRows = await db
    .select({ id: bills.id })
    .from(bills)
    .where(eq(bills.visitId, visitId));

  for (const b of billRows) {
    await db.delete(auditLog).where(eq(auditLog.entityId, b.id));
    await db.delete(payments).where(eq(payments.billId, b.id));
    await db.delete(billItems).where(eq(billItems.billId, b.id));
  }
  await db.delete(bills).where(eq(bills.visitId, visitId));
  await db.delete(tokens).where(eq(tokens.visitId, visitId));
  await db.delete(visits).where(eq(visits.id, visitId));
}

beforeEach(async () => {
  await cleanup();
  const [visit] = await db
    .insert(visits)
    .values({
      clinicId: CLINIC,
      patientId: MANJUNATH,
      doctorId: DOCTOR,
      visitDate: "2026-07-18",
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  await db.insert(tokens).values({
    clinicId: CLINIC,
    visitId,
    doctorId: DOCTOR,
    tokenDate: "2026-07-18",
    number: 88,
    state: "at_pharmacy",
  });
});

afterEach(cleanup);

const record = (mode: "cash" | "upi" | "card" = "upi", lines = LINES) =>
  recordBill({ clinicId: CLINIC, visitId, lines, mode, actorStaffId: STAFF });

describe("recordBill", () => {
  it("writes a bill with server-computed totals", async () => {
    const result = await record();
    expect(result.ok).toBe(true);

    const [bill] = await db
      .select({ total: bills.total, tax: bills.taxAmount })
      .from(bills)
      .where(eq(bills.visitId, visitId));

    /* ₹300 + (2 × ₹56) = ₹412; tax 12% extracted from the ₹112 = ₹12. */
    expect(Number(bill.total)).toBe(412);
    expect(Number(bill.tax)).toBe(12);
  });

  it("writes one bill item per line", async () => {
    const result = await record();
    if (!result.ok) throw new Error("expected success");

    const items = await db
      .select({ kind: billItems.kind, lineTotal: billItems.lineTotal })
      .from(billItems)
      .where(eq(billItems.billId, result.billId));

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.kind).sort()).toEqual(["goods", "service"]);
  });

  it("records the payment against the bill", async () => {
    const result = await record("cash");
    if (!result.ok) throw new Error("expected success");

    const [payment] = await db
      .select({ mode: payments.mode, amount: payments.amount })
      .from(payments)
      .where(eq(payments.billId, result.billId));

    expect(payment.mode).toBe("cash");
    expect(Number(payment.amount)).toBe(412);
  });

  it("flips the token to billed", async () => {
    await record();

    const [token] = await db
      .select({ state: tokens.state })
      .from(tokens)
      .where(eq(tokens.visitId, visitId));

    expect(token.state).toBe("billed");
  });

  it("logs the bill", async () => {
    const result = await record();
    if (!result.ok) throw new Error("expected success");

    const [entry] = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, result.billId));

    expect(entry.action).toBe("bill_recorded");
  });

  it("refuses to bill the same visit twice", async () => {
    const first = await record();
    const second = await record();

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: "This visit is already billed" });

    /* And only one bill exists. */
    const count = await db
      .select({ id: bills.id })
      .from(bills)
      .where(eq(bills.visitId, visitId));
    expect(count).toHaveLength(1);
  });

  it("does not double-bill under a concurrent double-tap", async () => {
    const [a, b] = await Promise.all([record(), record()]);
    const succeeded = [a, b].filter((r) => r.ok).length;

    expect(succeeded).toBe(1);

    const count = await db
      .select({ id: bills.id })
      .from(bills)
      .where(eq(bills.visitId, visitId));
    expect(count).toHaveLength(1);
  });

  it("refuses an empty bill", async () => {
    const result = await recordBill({
      clinicId: CLINIC,
      visitId,
      lines: [],
      mode: "upi",
      actorStaffId: STAFF,
    });
    expect(result).toEqual({ ok: false, error: "Nothing to bill" });
  });

  it("does not bill a visit from another clinic", async () => {
    /* RLS-independent guard: the visit is not visible, so no token flips. */
    const result = await recordBill({
      clinicId: OTHER_CLINIC,
      visitId,
      lines: LINES,
      mode: "upi",
      actorStaffId: STAFF,
    });
    /* The visit belongs to CLINIC, so recording under OTHER_CLINIC must not
       touch its token — the observable proof that nothing leaked across. */
    void result;
    const [token] = await db
      .select({ state: tokens.state })
      .from(tokens)
      .where(eq(tokens.visitId, visitId));
    expect(token.state).toBe("at_pharmacy");
  });
});
