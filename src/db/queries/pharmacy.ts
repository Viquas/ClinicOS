import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { batches, inventoryItems } from "@/db/schema";

/**
 * Inventory reads (§7.5).
 *
 * Batches come back in FEFO order straight from SQL — nearest expiry first —
 * so the pharmacy screen's pre-selection is just "the first one", and the
 * ordering rule lives in one place rather than being re-sorted per screen.
 */

export type BatchRow = {
  id: string;
  batchNo: string;
  expiryDate: string;
  quantityRemaining: number;
};

export type StockItem = {
  id: string;
  name: string;
  form: string;
  strength: string | null;
  unit: string;
  scheduleClass: string;
  reorderLevel: number;
  isConsumable: boolean;
  mrpPerUnit: number | null;
  gstRate: number;
  batches: BatchRow[];
};

export async function getStock(
  clinicId: string,
  tx: Executor = db,
): Promise<StockItem[]> {
  const rows = await tx
    .select({
      itemId: inventoryItems.id,
      name: inventoryItems.name,
      form: inventoryItems.form,
      strength: inventoryItems.strength,
      unit: inventoryItems.unit,
      scheduleClass: inventoryItems.scheduleClass,
      reorderLevel: inventoryItems.reorderLevel,
      isConsumable: inventoryItems.isConsumable,
      mrpPerUnit: inventoryItems.mrpPerUnit,
      gstRate: inventoryItems.gstRate,
      batchId: batches.id,
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      quantityRemaining: batches.quantityRemaining,
    })
    .from(inventoryItems)
    /* Left join: an item with no batches yet is still in the formulary and
       must be visible — it can be prescribed, just not dispensed. */
    .leftJoin(
      batches,
      and(eq(batches.itemId, inventoryItems.id), isNull(batches.archivedAt)),
    )
    .where(
      and(
        eq(inventoryItems.clinicId, clinicId),
        isNull(inventoryItems.archivedAt),
      ),
    )
    /* Nearest expiry first — this IS the FEFO order (§7.5). */
    .orderBy(asc(inventoryItems.name), asc(batches.expiryDate));

  const byItem = new Map<string, StockItem>();

  for (const row of rows) {
    let item = byItem.get(row.itemId);

    if (!item) {
      item = {
        id: row.itemId,
        name: row.name,
        form: row.form,
        strength: row.strength,
        unit: row.unit,
        scheduleClass: row.scheduleClass,
        reorderLevel: Number(row.reorderLevel),
        isConsumable: row.isConsumable,
        mrpPerUnit: row.mrpPerUnit === null ? null : Number(row.mrpPerUnit),
        gstRate: Number(row.gstRate),
        batches: [],
      };
      byItem.set(row.itemId, item);
    }

    if (row.batchId) {
      item.batches.push({
        id: row.batchId,
        batchNo: row.batchNo!,
        expiryDate: row.expiryDate!,
        quantityRemaining: Number(row.quantityRemaining),
      });
    }
  }

  return [...byItem.values()];
}
