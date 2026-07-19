import { describe, expect, it } from "vitest";
import { getVaccinationRoster, getVaccineProcedureIds } from "./vaccinations";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const TODAY = "2026-07-18";

describe("getVaccinationRoster", () => {
  it("includes every patient with a recorded date of birth", async () => {
    const roster = await getVaccinationRoster(CLINIC, TODAY);
    const names = roster.map((r) => r.name);

    expect(names).toContain("Bhavana R");
    expect(names).toContain("Aarav Prakash");
    expect(names).toContain("Nagaraj K");
  });

  it("excludes patients with only a recorded age, no date of birth", async () => {
    /* Lakshmi Devi has ageYears but no dateOfBirth in the seed — a schedule
       cannot be anchored without a birth date. */
    const roster = await getVaccinationRoster(CLINIC, TODAY);
    expect(roster.map((r) => r.name)).not.toContain("Lakshmi Devi");
  });

  it("marks Bhavana's three birth doses as given on her actual date of birth", async () => {
    const roster = await getVaccinationRoster(CLINIC, TODAY);
    const bhavana = roster.find((r) => r.name === "Bhavana R")!;

    const bcg = bhavana.schedule.find((s) => s.dose.id === "bcg")!;
    expect(bcg.status).toBe("given");
    expect(bcg.givenOn).toBe("2025-05-14");

    const hepb = bhavana.schedule.find((s) => s.dose.id === "hepb-0")!;
    expect(hepb.status).toBe("given");

    const opv0 = bhavana.schedule.find((s) => s.dose.id === "opv-0")!;
    expect(opv0.status).toBe("given");
  });

  it("leaves Bhavana's later doses due, since only birth doses were given", async () => {
    const roster = await getVaccinationRoster(CLINIC, TODAY);
    const bhavana = roster.find((r) => r.name === "Bhavana R")!;

    /* She is 14 months old — penta-1 (due at 6 weeks) is long overdue. */
    const penta1 = bhavana.schedule.find((s) => s.dose.id === "penta-1")!;
    expect(penta1.status).toBe("overdue");
    expect(bhavana.owed.length).toBeGreaterThan(0);
  });

  it("does not confuse ORS Therapy with a vaccine dose", async () => {
    /* Bhavana also has a completed ORS Therapy task — its name is not in the
       schedule, so it must not appear as a given dose or shift any date. */
    const roster = await getVaccinationRoster(CLINIC, TODAY);
    const bhavana = roster.find((r) => r.name === "Bhavana R")!;

    expect(bhavana.schedule.every((s) => s.dose.name !== "ORS Therapy")).toBe(
      true,
    );
  });

  it("flags Nagaraj's un-given birth dose as overdue past its grace period", async () => {
    const roster = await getVaccinationRoster(CLINIC, TODAY);
    const nagaraj = roster.find((r) => r.name === "Nagaraj K")!;

    /* Born 2026-06-02; today is 2026-07-18 — 46 days old. BCG is due at
       birth with a 4-week (28-day) grace, so at 46 days with no recorded
       dose he is genuinely overdue, not merely due. */
    const bcg = nagaraj.schedule.find((s) => s.dose.id === "bcg")!;
    expect(bcg.status).toBe("overdue");
    expect(bcg.givenOn).toBeUndefined();
  });

  it("is scoped to the clinic", async () => {
    expect(await getVaccinationRoster(OTHER_CLINIC, TODAY)).toEqual([]);
  });
});

describe("getVaccineProcedureIds", () => {
  it("resolves all 21 schedule doses to real procedure ids", async () => {
    const map = await getVaccineProcedureIds(CLINIC);
    expect(map.size).toBe(21);
    expect(map.get("bcg")).toBeDefined();
  });

  it("is scoped to the clinic", async () => {
    const map = await getVaccineProcedureIds(OTHER_CLINIC);
    expect(map.size).toBe(0);
  });
});
