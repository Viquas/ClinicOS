/**
 * Bill totals and the GST split (§7.7, §9.4).
 *
 * Two rules drive everything here:
 *
 *  1. Healthcare services provided by a clinical establishment are GST-exempt.
 *     Medicines and consumables sold are taxable. One visit produces both, so
 *     the exempt/taxable distinction lives on the LINE, not the bill.
 *
 *  2. Indian pharmacy retail sells at MRP, and MRP is tax-INCLUSIVE. So tax on
 *     a goods line is extracted out of the price, never added on top:
 *
 *         tax = lineTotal × rate / (100 + rate)
 *
 *     Adding it on top would overcharge the patient and produce a bill total
 *     that disagrees with the printed strip — the error a naive implementation
 *     makes, and one a pharmacist would catch on day one.
 *
 * All money is handled in paise (integers). Rupee floats accumulate rounding
 * error across a day of billing and will not reconcile at cash closing.
 */

export type BillLine = {
  description: string;
  kind: "service" | "goods";
  quantity: number;
  /** Unit price in paise. For goods this is MRP, which includes GST. */
  unitPaise: number;
  /** GST percentage, e.g. 5 or 12. Ignored on service lines. */
  gstRate: number;
};

export type BillTotals = {
  /** Sum of all line totals, in paise. What the patient actually pays. */
  grossPaise: number;
  /** Exempt (service) portion of gross. */
  exemptPaise: number;
  /** Taxable (goods) portion of gross, tax-inclusive. */
  taxableGrossPaise: number;
  /** Tax contained within taxableGrossPaise. */
  taxPaise: number;
  /** taxableGrossPaise minus taxPaise. */
  taxableNetPaise: number;
  discountPaise: number;
  payablePaise: number;
};

export function lineTotalPaise(line: BillLine): number {
  return Math.round(line.unitPaise * line.quantity);
}

/**
 * Extracts the tax contained within a tax-inclusive amount.
 * Returns 0 for service lines and for a zero rate.
 */
export function includedTaxPaise(line: BillLine): number {
  if (line.kind === "service" || line.gstRate <= 0) return 0;

  const gross = lineTotalPaise(line);
  return Math.round((gross * line.gstRate) / (100 + line.gstRate));
}

export function computeTotals(
  lines: BillLine[],
  options: {
    /**
     * An unregistered clinic charges no GST at all — it cannot collect tax it
     * is not registered for. Goods still bill at MRP; the split simply
     * reports no tax component.
     */
    isGstRegistered: boolean;
    discountPaise?: number;
  },
): BillTotals {
  let exemptPaise = 0;
  let taxableGrossPaise = 0;
  let taxPaise = 0;

  for (const line of lines) {
    const total = lineTotalPaise(line);

    if (line.kind === "service") {
      exemptPaise += total;
      continue;
    }

    taxableGrossPaise += total;
    if (options.isGstRegistered) {
      taxPaise += includedTaxPaise(line);
    }
  }

  const grossPaise = exemptPaise + taxableGrossPaise;
  const discountPaise = Math.min(options.discountPaise ?? 0, grossPaise);

  return {
    grossPaise,
    exemptPaise,
    taxableGrossPaise,
    taxPaise,
    taxableNetPaise: taxableGrossPaise - taxPaise,
    discountPaise,
    payablePaise: grossPaise - discountPaise,
  };
}

/** 318000 → "₹3,180.00", using the Indian digit grouping. */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
