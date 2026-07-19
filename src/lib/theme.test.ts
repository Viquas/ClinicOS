import { describe, expect, it } from "vitest";
import { isEveningAt, resolveTheme, THEME_INIT_SCRIPT } from "./theme";

describe("isEveningAt", () => {
  it("treats 5pm to midnight as evening", () => {
    expect(isEveningAt(17)).toBe(true);
    expect(isEveningAt(21)).toBe(true);
    expect(isEveningAt(23)).toBe(true);
  });

  it("treats midnight to 6am as evening", () => {
    expect(isEveningAt(0)).toBe(true);
    expect(isEveningAt(5)).toBe(true);
  });

  it("treats the working day as not evening", () => {
    expect(isEveningAt(6)).toBe(false);
    expect(isEveningAt(9)).toBe(false);
    expect(isEveningAt(16)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("follows the clock on auto", () => {
    expect(resolveTheme("auto", 9)).toBe("light");
    expect(resolveTheme("auto", 19)).toBe("dark");
  });

  it("lets an explicit choice override the clock in both directions", () => {
    /* A doctor in a bright room at 7pm must be able to force light back. */
    expect(resolveTheme("light", 19)).toBe("light");
    expect(resolveTheme("dark", 9)).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("guards against localStorage throwing", () => {
    /* Private-mode WebViews on some budget Android builds throw on access;
       a theme preference must never cost a blank screen. */
    expect(THEME_INIT_SCRIPT).toContain("try");
    expect(THEME_INIT_SCRIPT).toContain("catch");
  });

  it("agrees with resolveTheme about the evening boundary", () => {
    expect(THEME_INIT_SCRIPT).toContain("hour >= 17 || hour < 6");
  });
});
