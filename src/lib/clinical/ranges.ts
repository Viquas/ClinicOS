/**
 * Threshold validation as design (§8.3 rule 4).
 *
 * These return a human-readable note, never a boolean — the UI restyles the
 * input card and prints the note, and saving stays possible regardless. A real
 * 41.2°C must be recordable; form validation does not get to overrule a
 * thermometer.
 *
 * Thresholds are intentionally wide. A narrow range that cries wolf on every
 * third child trains nurses to ignore the colour, which is worse than having
 * no colour at all.
 */

export type RangeContext = { ageMonths?: number };

type Rule = (value: number, ctx: RangeContext) => string | undefined;

const RULES: Record<string, Rule> = {
  tempC: (v) => {
    if (v >= 41) return "Very high — recheck and escalate";
    if (v >= 38) return "Fever — above 38.0 °C";
    if (v < 35.5) return "Low — below 35.5 °C";
    return undefined;
  },

  spo2: (v) => {
    if (v < 90) return "Low oxygen — below 90%";
    if (v < 94) return "Borderline — below 94%";
    return undefined;
  },

  weightKg: (v, { ageMonths }) => {
    if (v <= 0) return "Must be greater than zero";

    /*
     * A plausibility ceiling, not a clinical judgement. This is the 61.2 kg
     * four-year-old from §8.3 rule 2 — almost always a typo or a scale left
     * in the wrong mode, and worth catching at the point of entry.
     */
    if (ageMonths !== undefined && ageMonths <= 60 && v > 35) {
      return "Unusually high for this age — check the reading";
    }
    if (v > 250) return "Check the reading";
    return undefined;
  },

  heightCm: (v, { ageMonths }) => {
    if (v <= 0) return "Must be greater than zero";
    if (ageMonths !== undefined && ageMonths <= 60 && v > 140) {
      return "Unusually tall for this age — check the reading";
    }
    if (v > 250) return "Check the reading";
    return undefined;
  },
};

/**
 * Returns undefined for a blank or unparseable field: an empty input is not
 * an error, it is simply not filled in yet. Only the explicit skip action
 * records "not measured".
 */
export function checkRange(
  key: string,
  value: number,
  ctx: RangeContext = {},
): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  return RULES[key]?.(value, ctx);
}
