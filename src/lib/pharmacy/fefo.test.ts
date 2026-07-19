import { describe, expect, it } from "vitest";
import {
  allocateFefo,
  assertDispensable,
  daysToExpiry,
  ExpiredStockError,
  InsufficientStockError,
  isExpired,
  selectableBatches,
  type DispensableBatch,
} from "./fefo";

const TODAY = new Date("2026-07-18T09:30:00Z");

const batch = (
  over: Partial<DispensableBatch> & Pick<DispensableBatch, "id" | "expiryDate">,
): DispensableBatch => ({
  batchNo: `B-${over.id}`,
  quantityRemaining: 100,
  ...over,
});

describe("acceptance criterion §7.5", () => {
  it("pre-selects the near-expiry batch over a fresher one", () => {
    const nearExpiry = batch({ id: "1", expiryDate: "2026-08-07" }); // 20 days
    const fresher = batch({ id: "2", expiryDate: "2027-03-01" });

    const [first] = selectableBatches([fresher, nearExpiry], TODAY);

    expect(first.id).toBe("1");
  });

  it("blocks dispensing from an expired batch", () => {
    const expired = batch({ id: "1", expiryDate: "2026-06-30" });

    expect(() => assertDispensable(expired, 1, TODAY)).toThrow(
      ExpiredStockError,
    );
  });
});

describe("isExpired", () => {
  it("treats the expiry date itself as expired", () => {
    expect(isExpired({ expiryDate: "2026-07-18" }, TODAY)).toBe(true);
  });

  it("treats the day after today as unexpired", () => {
    expect(isExpired({ expiryDate: "2026-07-19" }, TODAY)).toBe(false);
  });
});

describe("selectableBatches", () => {
  it("drops expired and empty batches", () => {
    const result = selectableBatches(
      [
        batch({ id: "expired", expiryDate: "2026-01-01" }),
        batch({ id: "empty", expiryDate: "2027-01-01", quantityRemaining: 0 }),
        batch({ id: "good", expiryDate: "2027-01-01" }),
      ],
      TODAY,
    );

    expect(result.map((b) => b.id)).toEqual(["good"]);
  });

  it("breaks ties on identical expiry deterministically", () => {
    const result = selectableBatches(
      [
        batch({ id: "2", batchNo: "B-002", expiryDate: "2027-01-01" }),
        batch({ id: "1", batchNo: "B-001", expiryDate: "2027-01-01" }),
      ],
      TODAY,
    );

    expect(result.map((b) => b.batchNo)).toEqual(["B-001", "B-002"]);
  });
});

describe("allocateFefo", () => {
  it("draws entirely from the nearest-expiry batch when it can cover", () => {
    const allocations = allocateFefo(
      [
        batch({ id: "near", expiryDate: "2026-08-07", quantityRemaining: 30 }),
        batch({ id: "far", expiryDate: "2027-06-01" }),
      ],
      10,
      TODAY,
    );

    expect(allocations).toEqual([
      {
        batchId: "near",
        batchNo: "B-near",
        quantity: 10,
        expiryDate: "2026-08-07",
      },
    ]);
  });

  it("splits across batches in expiry order when one cannot cover", () => {
    const allocations = allocateFefo(
      [
        batch({ id: "far", expiryDate: "2027-06-01", quantityRemaining: 50 }),
        batch({ id: "near", expiryDate: "2026-08-07", quantityRemaining: 12 }),
      ],
      20,
      TODAY,
    );

    expect(allocations).toEqual([
      {
        batchId: "near",
        batchNo: "B-near",
        quantity: 12,
        expiryDate: "2026-08-07",
      },
      {
        batchId: "far",
        batchNo: "B-far",
        quantity: 8,
        expiryDate: "2027-06-01",
      },
    ]);
  });

  it("never counts expired stock toward availability", () => {
    expect(() =>
      allocateFefo(
        [
          batch({
            id: "expired",
            expiryDate: "2026-01-01",
            quantityRemaining: 500,
          }),
          batch({ id: "good", expiryDate: "2027-01-01", quantityRemaining: 5 }),
        ],
        10,
        TODAY,
      ),
    ).toThrow(InsufficientStockError);
  });

  it("refuses to allocate a non-positive quantity", () => {
    expect(() => allocateFefo([batch({ id: "1", expiryDate: "2027-01-01" })], 0, TODAY)).toThrow(
      RangeError,
    );
  });
});

describe("daysToExpiry", () => {
  it("counts forward to the expiry date", () => {
    expect(daysToExpiry({ expiryDate: "2026-08-07" }, TODAY)).toBe(20);
  });

  it("goes negative once expired", () => {
    expect(daysToExpiry({ expiryDate: "2026-07-08" }, TODAY)).toBe(-10);
  });
});
