import { describe, expect, it } from "vitest";
import { findAllergyConflicts } from "./allergy";

describe("no recorded allergies", () => {
  it("finds nothing", () => {
    expect(findAllergyConflicts("Amoxicillin", [])).toEqual([]);
  });
});

describe("direct class match", () => {
  it("catches amoxicillin against a penicillin allergy", () => {
    const [conflict] = findAllergyConflicts("Amoxicillin", ["Penicillin"]);

    expect(conflict).toMatchObject({
      matchedClass: "penicillin",
      crossSensitivity: false,
      recordedAllergy: "Penicillin",
    });
  });

  it("catches the fixture's real-world allergy text", () => {
    /* The mock patient's allergy reads "Amoxicillin — rash". */
    const conflicts = findAllergyConflicts("Amoxicillin Susp. 250mg/5ml", [
      "Amoxicillin — rash",
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].crossSensitivity).toBe(false);
  });

  it("catches cotrimoxazole against a sulfa allergy", () => {
    const conflicts = findAllergyConflicts("Cotrimoxazole", ["Sulfa drugs"]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].matchedClass).toBe("sulfa");
  });

  it("tolerates the misspelling that shows up in paper registers", () => {
    const conflicts = findAllergyConflicts("Amoxicillin", ["Pencillin"]);
    expect(conflicts).toHaveLength(1);
  });
});

describe("cross-sensitivity", () => {
  it("cautions on a cephalosporin for a penicillin-allergic patient", () => {
    const [conflict] = findAllergyConflicts("Cefixime", ["Penicillin"]);

    expect(conflict).toMatchObject({
      matchedClass: "cephalosporin",
      crossSensitivity: true,
    });
  });

  it("marks a direct match as direct, not cross-sensitive", () => {
    const [conflict] = findAllergyConflicts("Cefixime", ["Cefixime"]);
    expect(conflict.crossSensitivity).toBe(false);
  });
});

describe("non-conflicts", () => {
  it("does not flag an unrelated drug", () => {
    expect(findAllergyConflicts("Paracetamol", ["Penicillin"])).toEqual([]);
  });

  it("does not flag a macrolide for a penicillin allergy", () => {
    /* Azithromycin is the standard substitution here — flagging it would make
       the warning useless precisely when the doctor is doing the right thing. */
    expect(findAllergyConflicts("Azithromycin", ["Penicillin"])).toEqual([]);
  });

  it("returns nothing for a drug absent from the class map", () => {
    expect(findAllergyConflicts("Zincovit", ["Penicillin"])).toEqual([]);
  });
});

describe("multiple allergies", () => {
  it("reports one conflict per matching recorded allergy", () => {
    const conflicts = findAllergyConflicts("Amoxicillin", [
      "Penicillin",
      "Sulfa drugs",
      "Dust",
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].recordedAllergy).toBe("Penicillin");
  });

  it("ignores allergies it cannot map to a class", () => {
    expect(findAllergyConflicts("Amoxicillin", ["Dust", "Pollen"])).toEqual([]);
  });
});

describe("case and formatting robustness", () => {
  it("is case-insensitive on both sides", () => {
    expect(findAllergyConflicts("AMOXICILLIN", ["penicillin"])).toHaveLength(1);
    expect(findAllergyConflicts("amoxicillin", ["PENICILLIN"])).toHaveLength(1);
  });

  it("strips a parenthetical or bracketed suffix", () => {
    expect(
      findAllergyConflicts("Amoxicillin (Mox)", ["Penicillin (severe)"]),
    ).toHaveLength(1);
  });
});
