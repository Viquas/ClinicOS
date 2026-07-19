/**
 * Display formatting shared across screens.
 *
 * These live at the display edge on purpose: the database stores canonical
 * values (lowercase enums, a date of birth) and the UI is responsible for
 * making them readable. Pre-formatting in the database would make the stored
 * value harder to query and impossible to re-render in another language.
 */

export type Ageable = {
  dateOfBirth?: string | null;
  ageYears?: number | null;
};

/** "male" → "Male". The enum is right for storage and wrong on screen. */
export function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Months between two dates, calendar-aware.
 *
 * Not (days / 30.44): a child born on 14 May is "2 m" on 14 July, and an
 * average-length month would render that as 2 m on some dates and 1 m on
 * others depending on which months were crossed.
 */
export function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);

  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());

  /* The day of month has not come round yet, so the last month is incomplete. */
  if (to.getUTCDate() < from.getUTCDate()) months--;

  return Math.max(0, months);
}

/**
 * "3 y 4 m" from a date of birth, or "34 y" when only an age was recorded.
 *
 * Under two years the label is months only: at that age months carry the
 * clinical meaning — dosing, growth percentile, vaccination interval — and
 * "0 y 7 m" reads as a rounding artefact rather than an age.
 */
export function ageLabel(patient: Ageable, asOf?: string): string {
  if (patient.dateOfBirth) {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const months = monthsBetween(patient.dateOfBirth, today);

    const years = Math.floor(months / 12);
    const rest = months % 12;

    if (years === 0) return `${rest} m`;
    if (years === 1) return `${months} m`;
    return `${years} y ${rest} m`;
  }

  return patient.ageYears != null ? `${patient.ageYears} y` : "—";
}
