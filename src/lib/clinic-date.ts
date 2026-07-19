/**
 * The clinic's own idea of "today" — PRD §7.2.
 *
 * Every screen used to pin `const TODAY = "2026-07-18"`, which made the whole
 * app a demo of one particular Tuesday: open it on any other day and the queue
 * is empty, the dashboard reads zero, and nothing looks broken enough to
 * explain why. A product cannot be frozen to a date.
 *
 * Asia/Kolkata rather than the server's zone, and deliberately not UTC. A
 * clinic in Mysuru closing at 9pm is already on the next UTC day, so a
 * UTC-derived date would roll the token sequence over mid-evening and start
 * the next morning's queue during evening OPD. The clinic's day is the one
 * the people in it are living.
 *
 * Returns YYYY-MM-DD because that is what the `date` columns store and what
 * every query compares against — never a Date, which would drag a time and a
 * zone along with it and invite exactly the off-by-one this exists to avoid.
 */
const CLINIC_TIME_ZONE = "Asia/Kolkata";

export function clinicToday(now: Date = new Date()): string {
  /* en-CA formats as YYYY-MM-DD, which is the format we want without
     hand-assembling parts and getting zero-padding wrong. */
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** YYYY-MM-DD, `days` before the clinic's today. Negative moves forward. */
export function clinicDaysAgo(days: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - days * 86_400_000);
  return clinicToday(shifted);
}

/**
 * Calendar-aware month arithmetic, clamped to the end of shorter months so
 * "one month before 31 March" is 28/29 February rather than 3 March.
 */
export function clinicMonthsAgo(months: number, now: Date = new Date()): string {
  const [y, m, d] = clinicToday(now).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));

  return target.toISOString().slice(0, 10);
}

/** First and last day of the clinic's current month, for dashboard windows. */
export function clinicMonthBounds(now: Date = new Date()): {
  start: string;
  end: string;
} {
  const [y, m] = clinicToday(now).split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return {
    start: `${y}-${String(m).padStart(2, "0")}-01`,
    end: `${y}-${String(m).padStart(2, "0")}-${end}`,
  };
}

/** "Tuesday, 18 July" — the header label, in the clinic's own timezone. */
export function clinicDayLabel(today: string): string {
  return new Date(`${today}T12:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
