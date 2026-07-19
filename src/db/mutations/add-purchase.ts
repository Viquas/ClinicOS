import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, batches, inventoryItems, stockMovements } from "@/db/schema";

/**
 * Purchase entry (§7.5) — stock arriving at the counter.
 *
 * One screen, one write: a batch and the ledger movement that records it, in
 * a transaction. There is deliberately no purchase-order or GRN step; that
 * friction is exactly what makes staff keep a parallel paper register.
 *
 * Expiry is required and validated. FEFO selection and the dispensing block
 * both key on it, so a batch without a valid future expiry cannot exist —
 * it would be un-dispensable dead stock the moment it was entered.
 */

export type AddPurchaseResult =
  | { ok: true; batchId: string }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addPurchase({
  clinicId,
  itemId,
  batchNo,
  expiryDate,
  quantity,
  costPerUnit,
  supplierName,
  invoiceNo,
  actorStaffId,
  today,
  executor = db,
}: {
  clinicId: string;
  itemId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPerUnit?: number | null;
  supplierName?: string | null;
  invoiceNo?: string | null;
  actorStaffId: string | null;
  today: string;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<AddPurchaseResult> {
  if (!batchNo.trim()) {
    return { ok: false, error: "Enter the batch number" };
  }
  if (!ISO_DATE.test(expiryDate)) {
    return { ok: false, error: "Enter the expiry as YYYY-MM-DD" };
  }
  if (expiryDate <= today) {
    /* Buying already-expired stock is almost always a typo, and if it is not,
       it is stock that can never be dispensed. Refuse it at entry. */
    return { ok: false, error: "Expiry must be a future date" };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Enter a quantity greater than zero" };
  }

  try {
    return await executor.transaction(async (tx) => {
      const [item] = await tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.clinicId, clinicId),
            eq(inventoryItems.id, itemId),
          ),
        )
        .limit(1);

      if (!item) return { ok: false as const, error: "Item not in formulary" };

      const [batch] = await tx
        .insert(batches)
        .values({
          clinicId,
          itemId,
          batchNo: batchNo.trim(),
          expiryDate,
          quantityReceived: String(quantity),
          quantityRemaining: String(quantity),
          costPerUnit: costPerUnit == null ? null : String(costPerUnit),
          supplierName: supplierName?.trim() || null,
          invoiceNo: invoiceNo?.trim() || null,
        })
        .returning({ id: batches.id });

      await tx.insert(stockMovements).values({
        clinicId,
        batchId: batch.id,
        kind: "purchase",
        quantityDelta: String(quantity),
        byStaffId: actorStaffId,
        reason: invoiceNo?.trim() ? `Invoice ${invoiceNo.trim()}` : null,
      });

      await tx.insert(auditLog).values({
        clinicId,
        actorStaffId,
        action: "purchase_added",
        entityTable: "batches",
        entityId: batch.id,
        detail: { batchNo: batchNo.trim(), quantity, expiryDate },
      });

      return { ok: true as const, batchId: batch.id };
    });
  } catch (error) {
    console.error("addPurchase failed", error);
    return { ok: false, error: "Could not add the purchase" };
  }
}
