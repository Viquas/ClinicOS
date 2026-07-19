import { describe, expect, it } from "vitest";
import { checkRange } from "./ranges";
import { percentileNote } from "./growth";

describe("checkRange — blank and unparseable input", () => {
  it("is silent, because an empty field is not an error", () => {
    expect(checkRange("tempC", NaN)).toBeUndefined();
    expect(checkRange("weightKg", NaN)).toBeUndefined();
  });

  it("is silent for a key with no rule", () => {
    expect(checkRange("fundalHeight", 32)).toBeUndefined();
  });
});

describe("temperature", () => {
  it("flags fever at and above 38", () => {
    expect(checkRange("tempC", 38)).toMatch(/fever/i);
    expect(checkRange("tempC", 38.9)).toMatch(/fever/i);
  });

  it("stays quiet just below the threshold", () => {
    expect(checkRange("tempC", 37.9)).toBeUndefined();
  });

  it("escalates above 41 rather than repeating the fever note", () => {
    expect(checkRange("tempC", 41.2)).toMatch(/escalate/i);
  });

  it("flags hypothermia", () => {
    expect(checkRange("tempC", 35.0)).toMatch(/low/i);
  });
});

describe("SpO2", () => {
  it("distinguishes borderline from low", () => {
    expect(checkRange("spo2", 93)).toMatch(/borderline/i);
    expect(checkRange("spo2", 88)).toMatch(/low oxygen/i);
    expect(checkRange("spo2", 97)).toBeUndefined();
  });
});

describe("weight — the §8.3 rule 2 case", () => {
  it("catches 61.2 kg on a four-year-old", () => {
    expect(checkRange("weightKg", 61.2, { ageMonths: 48 })).toMatch(
      /check the reading/i,
    );
  });

  it("accepts a plausible weight for the same child", () => {
    expect(checkRange("weightKg", 16.4, { ageMonths: 48 })).toBeUndefined();
  });

  it("does not apply the child ceiling to an adult", () => {
    expect(checkRange("weightKg", 61.2, { ageMonths: 420 })).toBeUndefined();
    expect(checkRange("weightKg", 61.2)).toBeUndefined();
  });

  it("rejects zero and negatives", () => {
    expect(checkRange("weightKg", 0)).toBeDefined();
    expect(checkRange("weightKg", -5)).toBeDefined();
  });
});

describe("percentileNote", () => {
  it("returns nothing without an age", () => {
    expect(percentileNote({ sex: "Male", weightKg: 14 })).toBeUndefined();
  });

  it("returns nothing beyond the table's 5-year range", () => {
    expect(
      percentileNote({ ageMonths: 120, sex: "Male", weightKg: 30 }),
    ).toBeUndefined();
  });

  it("puts a median-weight child near the 50th percentile", () => {
    const note = percentileNote({ ageMonths: 36, sex: "Male", weightKg: 14.3 });
    expect(note?.tone).toBe("accent");
    expect(note?.label).toMatch(/^(4[0-9]|5[0-9])th percentile$/);
  });

  it("flags a severely underweight child as an alert", () => {
    const note = percentileNote({ ageMonths: 36, sex: "Male", weightKg: 9.0 });
    expect(note?.tone).toBe("alert");
    expect(note?.detail).toMatch(/severely underweight/i);
  });

  it("flags a moderately underweight child as a warning, not an alert", () => {
    const note = percentileNote({ ageMonths: 36, sex: "Male", weightKg: 10.8 });
    expect(note?.tone).toBe("warning");
    expect(note?.detail).toMatch(/underweight/i);
  });

  it("interpolates between table anchors rather than snapping", () => {
    const at30 = percentileNote({ ageMonths: 30, sex: "Female", weightKg: 12.7 });
    expect(at30).toBeDefined();
    expect(at30?.tone).toBe("accent");
  });
});
