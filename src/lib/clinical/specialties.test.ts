import { describe, expect, it } from "vitest";
import { resolveSpecialtyPack, SPECIALTY_REGISTRY } from "./specialties";

describe("resolveSpecialtyPack", () => {
  it("returns the registry's pediatric fields with metadata attached", () => {
    const pack = resolveSpecialtyPack("pediatrics");

    expect(pack.vitalFields.map((f) => f.key)).toEqual([
      "weightKg",
      "heightCm",
      "tempC",
      "spo2",
    ]);
    expect(pack.vitalFields.find((f) => f.key === "weightKg")).toEqual({
      key: "weightKg",
      label: "Weight",
      unit: "kg",
    });
    expect(pack.modules.growthTrends).toBe(true);
    expect(pack.modules.vaccinations).toBe(true);
  });

  it("returns a non-pediatric specialty with growth/vaccine modules off", () => {
    const pack = resolveSpecialtyPack("dermatology");

    expect(pack.vitalFields.map((f) => f.key)).toEqual(["tempC", "bp"]);
    expect(pack.modules.growthTrends).toBe(false);
    expect(pack.modules.vaccinations).toBe(false);
    expect(pack.diagnosisFavourites).toContain("Acne vulgaris");
  });

  it("falls back to a generic pack for an unregistered specialty", () => {
    const pack = resolveSpecialtyPack("neurology");

    expect(pack.vitalFields.map((f) => f.key)).toEqual([
      "tempC",
      "bp",
      "pulse",
      "weightKg",
    ]);
    expect(pack.diagnosisFavourites).toEqual([]);
  });

  it("falls back for a null specialty", () => {
    expect(resolveSpecialtyPack(null).vitalFields.length).toBeGreaterThan(0);
  });

  it("lets a doctor's templatePack override the vitals field selection", () => {
    const pack = resolveSpecialtyPack("pediatrics", { vitals: ["tempC"] });
    expect(pack.vitalFields.map((f) => f.key)).toEqual(["tempC"]);
  });

  it("lets a doctor's templatePack override diagnosis favourites", () => {
    const pack = resolveSpecialtyPack("pediatrics", {
      diagnosisFavourites: ["Custom diagnosis"],
    });
    expect(pack.diagnosisFavourites).toEqual(["Custom diagnosis"]);
  });

  it("falls back to a label equal to the key for a field outside the catalog", () => {
    const pack = resolveSpecialtyPack("pediatrics", { vitals: ["unknownField"] });
    expect(pack.vitalFields[0]).toEqual({
      key: "unknownField",
      label: "unknownField",
      unit: "",
    });
  });

  it("covers every registered specialty with at least one vital field and one favourite", () => {
    for (const [name, pack] of Object.entries(SPECIALTY_REGISTRY)) {
      expect(pack.vitalKeys.length, `${name} has no vitals`).toBeGreaterThan(0);
      expect(
        pack.diagnosisFavourites.length,
        `${name} has no diagnosis favourites`,
      ).toBeGreaterThan(0);
    }
  });
});
