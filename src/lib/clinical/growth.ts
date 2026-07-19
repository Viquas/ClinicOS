/**
 * Weight-for-age percentile band (§7.3, §6 pediatrics row).
 *
 * SCOPE: this is a prototype approximation using a small WHO median/SD table
 * with linear interpolation between anchor points. It is good enough to prove
 * the interaction — a band appearing live as the nurse types — and is NOT
 * good enough to show a parent.
 *
 * Before this ships it must be replaced with the full WHO/IAP LMS tables and
 * the proper LMS z-score formula:
 *   z = ((value/M)^L - 1) / (L * S)      for L ≠ 0
 * The UI contract below (label + tone + detail) stays the same, so swapping
 * the maths is a self-contained change.
 */

type Sex = "Male" | "Female";

/** WHO weight-for-age anchors: ageMonths → [median kg, approx 1 SD kg]. */
const WEIGHT_FOR_AGE: Record<Sex, [number, number, number][]> = {
  //          months, median, sd
  Male: [
    [0, 3.3, 0.45],
    [6, 7.9, 0.9],
    [12, 9.6, 1.1],
    [24, 12.2, 1.4],
    [36, 14.3, 1.7],
    [48, 16.3, 2.0],
    [60, 18.3, 2.4],
  ],
  Female: [
    [0, 3.2, 0.45],
    [6, 7.3, 0.9],
    [12, 8.9, 1.1],
    [24, 11.5, 1.4],
    [36, 13.9, 1.7],
    [48, 16.0, 2.1],
    [60, 18.2, 2.5],
  ],
};

function interpolate(
  table: [number, number, number][],
  ageMonths: number,
): { median: number; sd: number } | undefined {
  if (ageMonths < table[0][0]) return undefined;

  const last = table[table.length - 1];
  if (ageMonths > last[0]) return undefined; // beyond 5y — out of scope here

  for (let i = 0; i < table.length - 1; i++) {
    const [a, aM, aS] = table[i];
    const [b, bM, bS] = table[i + 1];
    if (ageMonths >= a && ageMonths <= b) {
      const t = b === a ? 0 : (ageMonths - a) / (b - a);
      return { median: aM + (bM - aM) * t, sd: aS + (bS - aS) * t };
    }
  }
  return undefined;
}

/** Normal CDF via the Abramowitz–Stegun erf approximation. */
function zToPercentile(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return Math.round(((1 + sign * y) / 2) * 100);
}

export type GrowthNote = {
  label: string;
  detail: string;
  tone: "neutral" | "accent" | "warning" | "alert";
};

export function percentileNote({
  ageMonths,
  sex,
  weightKg,
}: {
  ageMonths?: number;
  sex: Sex;
  weightKg: number;
}): GrowthNote | undefined {
  if (!ageMonths || !Number.isFinite(weightKg) || weightKg <= 0) {
    return undefined;
  }

  const anchor = interpolate(WEIGHT_FOR_AGE[sex], ageMonths);
  if (!anchor) return undefined;

  const z = (weightKg - anchor.median) / anchor.sd;
  const percentile = Math.min(99, Math.max(1, zToPercentile(z)));

  /*
   * Bands follow WHO's underweight/severely-underweight cutoffs at −2SD and
   * −3SD, which is what the growth chart in an Indian pediatric clinic is
   * actually being read for.
   */
  if (z <= -3) {
    return {
      label: `${percentile}th percentile`,
      detail: "Severely underweight for age — below −3 SD",
      tone: "alert",
    };
  }
  if (z <= -2) {
    return {
      label: `${percentile}th percentile`,
      detail: "Underweight for age — below −2 SD",
      tone: "warning",
    };
  }
  if (z >= 3) {
    return {
      label: `${percentile}th percentile`,
      detail: "Well above median for age — above +3 SD",
      tone: "warning",
    };
  }

  return {
    label: `${percentile}th percentile`,
    detail: "Within the normal range for age",
    tone: "accent",
  };
}
