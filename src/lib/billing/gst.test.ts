import { describe, expect, it } from "vitest";
import {
  computeTotals,
  formatPaise,
  includedTaxPaise,
  lineTotalPaise,
  type BillLine,
} from "./gst";

const consultation: BillLine = {
  description: "Consultation",
  kind: "service",
  quantity: 1,
  unitPaise: 30000, // ₹300
  gstRate: 0,
};

const nebulisation: BillLine = {
  description: "Nebulisation",
  kind: "service",
  quantity: 1,
  unitPaise: 15000, // ₹150
  gstRate: 0,
};

const syrup: BillLine = {
  description: "Paracetamol Syrup",
  kind: "goods",
  quantity: 1,
  unitPaise: 5600, // ₹56 MRP, inclusive of 12%
  gstRate: 12,
};

describe("tax is extracted from MRP, not added to it", () => {
  it("computes the included component of a 12% line", () => {
    /* ₹56 MRP at 12% → 5600 × 12/112 = 600 paise = ₹6.00 */
    expect(includedTaxPaise(syrup)).toBe(600);
  });

  it("never exceeds the line total", () => {
    expect(includedTaxPaise(syrup)).toBeLessThan(lineTotalPaise(syrup));
  });

  it("returns zero tax for a service line even with a rate set", () => {
    expect(
      includedTaxPaise({ ...consultation, gstRate: 18 }),
    ).toBe(0);
  });

  it("returns zero for a zero-rated good", () => {
    expect(includedTaxPaise({ ...syrup, gstRate: 0 })).toBe(0);
  });
});

describe("the §7.7 mixed bill", () => {
  const lines = [consultation, nebulisation, syrup];

  it("keeps services exempt and goods taxable on one bill", () => {
    const t = computeTotals(lines, { isGstRegistered: true });

    expect(t.exemptPaise).toBe(45000); // 300 + 150
    expect(t.taxableGrossPaise).toBe(5600);
    expect(t.taxPaise).toBe(600);
    expect(t.taxableNetPaise).toBe(5000);
  });

  it("bills the patient the sum of MRP and fees, with no tax added on top", () => {
    const t = computeTotals(lines, { isGstRegistered: true });

    /* The critical assertion: gross is 300 + 150 + 56, NOT 56 × 1.12. */
    expect(t.grossPaise).toBe(50600);
    expect(t.payablePaise).toBe(50600);
  });

  it("splits gross exactly into exempt and taxable with nothing lost", () => {
    const t = computeTotals(lines, { isGstRegistered: true });
    expect(t.exemptPaise + t.taxableGrossPaise).toBe(t.grossPaise);
  });

  it("splits the taxable portion exactly into net and tax", () => {
    const t = computeTotals(lines, { isGstRegistered: true });
    expect(t.taxableNetPaise + t.taxPaise).toBe(t.taxableGrossPaise);
  });
});

describe("unregistered clinic", () => {
  it("charges the same total but reports no tax", () => {
    const lines = [consultation, syrup];
    const registered = computeTotals(lines, { isGstRegistered: true });
    const unregistered = computeTotals(lines, { isGstRegistered: false });

    expect(unregistered.grossPaise).toBe(registered.grossPaise);
    expect(unregistered.taxPaise).toBe(0);
    expect(unregistered.taxableNetPaise).toBe(unregistered.taxableGrossPaise);
  });
});

describe("discounts", () => {
  it("subtracts from the payable amount", () => {
    const t = computeTotals([consultation], {
      isGstRegistered: true,
      discountPaise: 5000,
    });

    expect(t.discountPaise).toBe(5000);
    expect(t.payablePaise).toBe(25000);
  });

  it("cannot exceed the gross, so payable never goes negative", () => {
    const t = computeTotals([consultation], {
      isGstRegistered: true,
      discountPaise: 99999,
    });

    expect(t.discountPaise).toBe(30000);
    expect(t.payablePaise).toBe(0);
  });
});

describe("quantities", () => {
  it("multiplies before extracting tax", () => {
    const t = computeTotals([{ ...syrup, quantity: 3 }], {
      isGstRegistered: true,
    });

    expect(t.taxableGrossPaise).toBe(16800);
    expect(t.taxPaise).toBe(1800);
  });
});

describe("empty bill", () => {
  it("is all zeroes rather than NaN", () => {
    const t = computeTotals([], { isGstRegistered: true });
    expect(t).toMatchObject({
      grossPaise: 0,
      exemptPaise: 0,
      taxPaise: 0,
      payablePaise: 0,
    });
  });
});

describe("formatPaise", () => {
  it("uses Indian digit grouping", () => {
    /* 3,18,000.00 — lakh grouping, not 318,000.00 */
    expect(formatPaise(31800000)).toBe("₹3,18,000.00");
  });

  it("always shows two decimal places", () => {
    expect(formatPaise(50600)).toBe("₹506.00");
    expect(formatPaise(5)).toBe("₹0.05");
  });
});
