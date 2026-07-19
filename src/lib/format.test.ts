import { describe, expect, it } from "vitest";
import { ageLabel, monthsBetween, titleCase } from "./format";

const TODAY = "2026-07-18";

describe("titleCase", () => {
  it("capitalises a stored enum value", () => {
    expect(titleCase("male")).toBe("Male");
    expect(titleCase("female")).toBe("Female");
  });

  it("leaves an empty string alone", () => {
    expect(titleCase("")).toBe("");
  });
});

describe("monthsBetween", () => {
  it("counts whole calendar months", () => {
    expect(monthsBetween("2026-05-14", "2026-07-14")).toBe(2);
  });

  it("does not count a month whose day has not come round", () => {
    /* 13 July is one day short of two full months from 14 May. */
    expect(monthsBetween("2026-05-14", "2026-07-13")).toBe(1);
  });

  it("crosses a year boundary", () => {
    expect(monthsBetween("2025-11-20", "2026-02-20")).toBe(3);
  });

  it("handles a birth date at end of month", () => {
    /* 31 Jan → 28 Feb is not yet a full month by day-of-month. */
    expect(monthsBetween("2026-01-31", "2026-02-28")).toBe(0);
    expect(monthsBetween("2026-01-31", "2026-03-31")).toBe(2);
  });

  it("never returns negative for a future date", () => {
    expect(monthsBetween("2027-01-01", TODAY)).toBe(0);
  });

  it("is zero on the day of birth", () => {
    expect(monthsBetween(TODAY, TODAY)).toBe(0);
  });
});

describe("ageLabel", () => {
  it("uses months only under one year", () => {
    /* Born 2 June 2026 → 1 m on 18 July. "0 y 1 m" would read as a rounding
       artefact rather than an age. */
    expect(ageLabel({ dateOfBirth: "2026-06-02" }, TODAY)).toBe("1 m");
  });

  it("uses months through the second year", () => {
    /* 14 months, not "1 y 2 m" — at this age the month count is what drives
       dosing and the vaccination interval. */
    expect(ageLabel({ dateOfBirth: "2025-05-14" }, TODAY)).toBe("14 m");
  });

  it("uses years and months from two upwards", () => {
    expect(ageLabel({ dateOfBirth: "2023-03-08" }, TODAY)).toBe("3 y 4 m");
    expect(ageLabel({ dateOfBirth: "2019-06-11" }, TODAY)).toBe("7 y 1 m");
  });

  it("shows a newborn as 0 m rather than an em dash", () => {
    expect(ageLabel({ dateOfBirth: TODAY }, TODAY)).toBe("0 m");
  });

  it("falls back to a recorded age when there is no date of birth", () => {
    /* Rural patients often know the year, not the date (§7.1). */
    expect(ageLabel({ ageYears: 62 }, TODAY)).toBe("62 y");
  });

  it("prefers the date of birth when both are present", () => {
    expect(
      ageLabel({ dateOfBirth: "2023-03-08", ageYears: 99 }, TODAY),
    ).toBe("3 y 4 m");
  });

  it("renders an em dash when neither is known", () => {
    expect(ageLabel({}, TODAY)).toBe("—");
    expect(ageLabel({ dateOfBirth: null, ageYears: null }, TODAY)).toBe("—");
  });

  it("treats age zero as a real value, not a missing one", () => {
    /* `ageYears: 0` is falsy — a truthiness check here would drop it. */
    expect(ageLabel({ ageYears: 0 }, TODAY)).toBe("0 y");
  });
});
