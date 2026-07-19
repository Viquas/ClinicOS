import { describe, expect, it } from "vitest";
import { assertPinAcceptable, hashPin, verifyPin, WeakPinError } from "./pin";

describe("assertPinAcceptable", () => {
  it("accepts a reasonable PIN", () => {
    expect(() => assertPinAcceptable("4071")).not.toThrow();
    expect(() => assertPinAcceptable("851623")).not.toThrow();
  });

  it("rejects non-digits", () => {
    expect(() => assertPinAcceptable("40a1")).toThrow(WeakPinError);
    expect(() => assertPinAcceptable("")).toThrow(WeakPinError);
  });

  it("rejects PINs outside 4–6 digits", () => {
    expect(() => assertPinAcceptable("407")).toThrow(WeakPinError);
    expect(() => assertPinAcceptable("4071234")).toThrow(WeakPinError);
  });

  it("rejects a single repeated digit", () => {
    expect(() => assertPinAcceptable("1111")).toThrow(WeakPinError);
    expect(() => assertPinAcceptable("000000")).toThrow(WeakPinError);
  });

  it("rejects consecutive runs in either direction", () => {
    expect(() => assertPinAcceptable("1234")).toThrow(WeakPinError);
    expect(() => assertPinAcceptable("456789")).toThrow(WeakPinError);
    expect(() => assertPinAcceptable("4321")).toThrow(WeakPinError);
    expect(() => assertPinAcceptable("9876")).toThrow(WeakPinError);
  });
});

describe("hashPin / verifyPin", () => {
  it("round-trips a correct PIN", async () => {
    const hash = await hashPin("4071");
    expect(await verifyPin("4071", hash)).toBe(true);
  });

  it("rejects an incorrect PIN", async () => {
    const hash = await hashPin("4071");
    expect(await verifyPin("4072", hash)).toBe(false);
  });

  it("salts, so the same PIN hashes differently each time", async () => {
    const a = await hashPin("4071");
    const b = await hashPin("4071");

    expect(a).not.toBe(b);
    expect(await verifyPin("4071", a)).toBe(true);
    expect(await verifyPin("4071", b)).toBe(true);
  });

  it("refuses to hash a weak PIN", async () => {
    await expect(hashPin("1111")).rejects.toThrow(WeakPinError);
  });
});

describe("verifyPin against malformed storage", () => {
  it("denies rather than throwing", async () => {
    for (const stored of [
      null,
      "",
      "not-a-hash",
      "scrypt$onlytwo",
      "bcrypt$aabb$ccdd",
      "scrypt$zzzz$ccdd",
      "scrypt$aabb$ccdd", // right shape, wrong lengths
    ]) {
      expect(await verifyPin("4071", stored)).toBe(false);
    }
  });
});
