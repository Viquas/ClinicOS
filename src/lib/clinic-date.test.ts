import { describe, expect, it } from "vitest";
import {
  clinicDaysAgo,
  clinicMonthBounds,
  clinicMonthsAgo,
  clinicToday,
} from "./clinic-date";

describe("clinicToday", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(clinicToday(new Date("2026-07-18T06:00:00Z"))).toBe("2026-07-18");
  });

  it("uses the clinic's evening, not UTC's next day", () => {
    /* 21:00 IST on the 18th is 15:30 UTC the same day — but 23:00 IST is
       17:30 UTC on the 18th while being the 18th locally. The case that
       actually bites: 01:00 IST on the 19th is 19:30 UTC on the 18th, and a
       UTC-derived date would still say the 18th, restarting yesterday's
       token sequence during night OPD. */
    expect(clinicToday(new Date("2026-07-18T19:30:00Z"))).toBe("2026-07-19");
  });

  it("stays on the clinic's day through late evening OPD", () => {
    expect(clinicToday(new Date("2026-07-18T15:30:00Z"))).toBe("2026-07-18");
  });
});

describe("clinicDaysAgo", () => {
  it("walks back a day", () => {
    expect(clinicDaysAgo(1, new Date("2026-07-18T06:00:00Z"))).toBe("2026-07-17");
  });

  it("crosses a month boundary", () => {
    expect(clinicDaysAgo(1, new Date("2026-08-01T06:00:00Z"))).toBe("2026-07-31");
  });

  it("crosses a year boundary", () => {
    expect(clinicDaysAgo(1, new Date("2026-01-01T06:00:00Z"))).toBe("2025-12-31");
  });

  it("moves forward on a negative count", () => {
    expect(clinicDaysAgo(-7, new Date("2026-07-18T06:00:00Z"))).toBe("2026-07-25");
  });
});

describe("clinicMonthsAgo", () => {
  it("walks back whole months", () => {
    expect(clinicMonthsAgo(3, new Date("2026-07-18T06:00:00Z"))).toBe("2026-04-18");
  });

  it("clamps to the end of a shorter month", () => {
    /* One month before 31 March is 28 February, not 3 March — the bug every
       naive date-shift has. */
    expect(clinicMonthsAgo(1, new Date("2026-03-31T06:00:00Z"))).toBe("2026-02-28");
  });

  it("handles a leap February", () => {
    expect(clinicMonthsAgo(1, new Date("2028-03-31T06:00:00Z"))).toBe("2028-02-29");
  });

  it("crosses a year boundary", () => {
    expect(clinicMonthsAgo(7, new Date("2026-03-15T06:00:00Z"))).toBe("2025-08-15");
  });
});

describe("clinicMonthBounds", () => {
  it("spans a 31-day month", () => {
    expect(clinicMonthBounds(new Date("2026-07-18T06:00:00Z"))).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });

  it("spans a 30-day month", () => {
    expect(clinicMonthBounds(new Date("2026-04-10T06:00:00Z"))).toEqual({
      start: "2026-04-01",
      end: "2026-04-30",
    });
  });

  it("spans February in a leap year", () => {
    expect(clinicMonthBounds(new Date("2028-02-10T06:00:00Z"))).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("spans February in a non-leap year", () => {
    expect(clinicMonthBounds(new Date("2026-02-10T06:00:00Z"))).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});
