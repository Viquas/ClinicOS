/**
 * FEFO (first-expiry-first-out) batch selection — PRD §7.5.
 *
 * Kept as a pure function over plain batch records so the rule that decides
 * what leaves the shelf can be tested exhaustively without a database. The
 * dispensing action wraps this; it does not reimplement it.
 */

export type DispensableBatch = {
  id: string;
  batchNo: string;
  /** ISO date, YYYY-MM-DD. */
  expiryDate: string;
  quantityRemaining: number;
};

export type BatchAllocation = {
  batchId: string;
  batchNo: string;
  quantity: number;
  expiryDate: string;
};

export class ExpiredStockError extends Error {
  constructor(readonly batchNo: string) {
    super(`Batch ${batchNo} has expired and cannot be dispensed`);
    this.name = "ExpiredStockError";
  }
}

export class InsufficientStockError extends Error {
  constructor(
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Requested ${requested} but only ${available} available`);
    this.name = "InsufficientStockError";
  }
}

/**
 * A batch expiring *on* `asOf` is expired. Medicines are labelled with an
 * expiry month and are not safe on the last day, so the comparison is
 * deliberately inclusive rather than strictly-after.
 */
export function isExpired(batch: { expiryDate: string }, asOf: Date): boolean {
  return batch.expiryDate <= toIsoDate(asOf);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Orders the batches a dispenser may draw from: nearest expiry first, expired
 * and empty batches removed entirely. The first element is what the pharmacy
 * screen pre-selects.
 */
export function selectableBatches(
  batches: DispensableBatch[],
  asOf: Date,
): DispensableBatch[] {
  return batches
    .filter((b) => b.quantityRemaining > 0 && !isExpired(b, asOf))
    .sort((a, b) =>
      a.expiryDate === b.expiryDate
        ? a.batchNo.localeCompare(b.batchNo)
        : a.expiryDate.localeCompare(b.expiryDate),
    );
}

/**
 * Allocates `quantity` across batches in FEFO order, splitting across batches
 * when the nearest-expiry one cannot cover the full amount.
 *
 * Throws rather than partially allocating: a short dispense is a clinical
 * decision for the pharmacist to make explicitly (the "out of stock, buy
 * outside" flow), never something this function decides silently.
 */
export function allocateFefo(
  batches: DispensableBatch[],
  quantity: number,
  asOf: Date,
): BatchAllocation[] {
  if (quantity <= 0) {
    throw new RangeError("Dispense quantity must be greater than zero");
  }

  const available = selectableBatches(batches, asOf);
  const total = available.reduce((sum, b) => sum + b.quantityRemaining, 0);

  if (total < quantity) {
    throw new InsufficientStockError(quantity, total);
  }

  const allocations: BatchAllocation[] = [];
  let outstanding = quantity;

  for (const batch of available) {
    if (outstanding === 0) break;

    const take = Math.min(batch.quantityRemaining, outstanding);
    allocations.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      quantity: take,
      expiryDate: batch.expiryDate,
    });
    outstanding -= take;
  }

  return allocations;
}

/**
 * The hard block from §7.5. Called on the dispense path even when the batch was
 * chosen manually, because the operator can override FEFO's suggestion but
 * cannot override expiry — only an owner-role action may do that, and it is
 * handled above this layer.
 */
export function assertDispensable(
  batch: DispensableBatch,
  quantity: number,
  asOf: Date,
): void {
  if (isExpired(batch, asOf)) {
    throw new ExpiredStockError(batch.batchNo);
  }
  if (batch.quantityRemaining < quantity) {
    throw new InsufficientStockError(quantity, batch.quantityRemaining);
  }
}

/** Days until expiry; negative once expired. Drives the 60/30-day alerts. */
export function daysToExpiry(batch: { expiryDate: string }, asOf: Date): number {
  const expiry = new Date(`${batch.expiryDate}T00:00:00Z`);
  const today = new Date(`${toIsoDate(asOf)}T00:00:00Z`);
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}
