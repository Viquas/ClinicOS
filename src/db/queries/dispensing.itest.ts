import { describe, expect, it } from "vitest";
import { getDispensingContext } from "./dispensing";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const TODAY = "2026-07-18";

describe("getDispensingContext", () => {
  it("returns the patient currently at the pharmacy", async () => {
    const context = await getDispensingContext(CLINIC, TODAY);

    expect(context).not.toBeNull();
    expect(context!.patient.name).toBe("Manjunath S");
    expect(context!.tokenNumber).toBe(7);
  });

  it("returns the prescription lines", async () => {
    const context = await getDispensingContext(CLINIC, TODAY);
    const names = context!.lines.map((l) => l.drugName).sort();

    expect(names).toEqual(["Amoxicillin Susp.", "Paracetamol Syrup"]);
  });

  it("orders each line's batches nearest-expiry first", async () => {
    const context = await getDispensingContext(CLINIC, TODAY);
    const paracetamol = context!.lines.find(
      (l) => l.drugName === "Paracetamol Syrup",
    )!;

    /* Seeded with three batches; the query must return them FEFO-ordered so
       the screen can pre-select the first. */
    expect(paracetamol.batches.length).toBeGreaterThanOrEqual(2);
    const dates = paracetamol.batches.map((b) => b.expiryDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it("carries the schedule class through", async () => {
    const context = await getDispensingContext(CLINIC, TODAY);
    const amox = context!.lines.find((l) => l.drugName === "Amoxicillin Susp.")!;

    expect(amox.scheduleClass).toBe("h");
  });

  it("resolves the unit from the inventory item", async () => {
    const context = await getDispensingContext(CLINIC, TODAY);
    expect(context!.lines.every((l) => l.unit !== null)).toBe(true);
  });

  it("returns null for a clinic with no one at the pharmacy", async () => {
    expect(await getDispensingContext(OTHER_CLINIC, TODAY)).toBeNull();
  });

  it("returns null for a date with no pharmacy queue", async () => {
    expect(await getDispensingContext(CLINIC, "2020-01-01")).toBeNull();
  });
});
