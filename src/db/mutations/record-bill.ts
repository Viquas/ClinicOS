import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  billItems,
  bills,
  payments,
  tokens,
  visits,
} from "@/db/schema";
import { computeTotals, type BillLine } from "@/lib/billing/gst";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown): string | undefined =>
    typeof value === "object" && value !== null && "code" in value
      ? (value as { code?: string }).code
      : undefined;

  if (codeOf(error) === UNIQUE_VIOLATION) return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return codeOf(cause) === UNIQUE_VIOLATION;
}

/**
 * Records a bill and its payment (§7.7).
 *
 * The totals are recomputed here from the lines rather than trusting whatever
 * the client posted — a bill is money, and the arithmetic that decides how
 * much a patient pays must live on the server. The client's totals are a
 * preview; these are the record.
 *
 * One transaction writes the bill, its lines, the payment, flips the token to
 * billed, and logs it. A partial write would leave a paid bill with no lines,
 * or a token stuck at the counter.
 */

export type RecordBillResult =
  | { ok: true; billId: string }
  | { ok: false; error: string };

export async function recordBill({
  clinicId,
  visitId,
  lines,
  mode,
  actorStaffId,
}: {
  clinicId: string;
  visitId: string;
  lines: (BillLine & { batchId?: string })[];
  mode: "cash" | "upi" | "card";
  actorStaffId: string | null;
}): Promise<RecordBillResult> {
  if (lines.length === 0) {
    return { ok: false, error: "Nothing to bill" };
  }

  try {
    return await db.transaction(async (tx) => {
      /*
       * Idempotency: a double-tap on "collect" must not write two bills for
       * one visit. Locking the visit row first — not just reading it — is
       * what makes this safe: without FOR UPDATE, two concurrent calls can
       * both see "no existing bill" before either commits, and both insert.
       * That is exactly what happened under this session's own test suite
       * running at load, not a hypothetical. The lock forces the second call
       * to wait, then re-check against the first call's committed bill.
       *
       * The unique index on bills (visit_id) where archived_at is null (see
       * schema/billing.ts) is the backstop if anything ever reaches this
       * point without going through the lock — the catch block below turns
       * that constraint violation into the same friendly error.
       */
      await tx.execute(
        sql`select id from ${visits} where id = ${visitId} and clinic_id = ${clinicId} for update`,
      );

      const [existing] = await tx
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.clinicId, clinicId), eq(bills.visitId, visitId)))
        .limit(1);

      if (existing) {
        return { ok: false as const, error: "This visit is already billed" };
      }

      const totals = computeTotals(lines, { isGstRegistered: true });

      const [bill] = await tx
        .insert(bills)
        .values({
          clinicId,
          visitId,
          subtotal: paise(totals.grossPaise),
          taxAmount: paise(totals.taxPaise),
          total: paise(totals.payablePaise),
          amountPaid: paise(totals.payablePaise),
          closedAt: new Date(),
        })
        .returning({ id: bills.id });

      await tx.insert(billItems).values(
        lines.map((line) => ({
          clinicId,
          billId: bill.id,
          kind: line.kind,
          description: line.description,
          batchId: line.batchId ?? null,
          quantity: String(line.quantity),
          unitPrice: paise(line.unitPaise),
          gstRate: String(line.gstRate),
          lineTotal: paise(Math.round(line.unitPaise * line.quantity)),
        })),
      );

      await tx.insert(payments).values({
        clinicId,
        billId: bill.id,
        mode,
        amount: paise(totals.payablePaise),
        collectedByStaffId: actorStaffId,
      });

      await tx
        .update(tokens)
        .set({ state: "billed", updatedAt: new Date() })
        .where(and(eq(tokens.clinicId, clinicId), eq(tokens.visitId, visitId)));

      await tx.insert(auditLog).values({
        clinicId,
        actorStaffId,
        action: "bill_recorded",
        entityTable: "bills",
        entityId: bill.id,
        detail: { mode, total: totals.payablePaise },
      });

      return { ok: true as const, billId: bill.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "This visit is already billed" };
    }
    console.error("recordBill failed", error);
    return { ok: false, error: "Could not record the bill" };
  }
}

/** Paise (integer) → the rupee-decimal string the numeric columns store. */
function paise(value: number): string {
  return (value / 100).toFixed(2);
}
