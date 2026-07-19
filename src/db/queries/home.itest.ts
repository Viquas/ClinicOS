import { describe, expect, it } from "vitest";
import { getDoctorFollowUpsToday } from "./home";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const DR_SAMEERA = "33333333-0000-0000-0000-000000000001";
const DR_ANAND = "33333333-0000-0000-0000-000000000002";
const TODAY = "2026-07-18";

describe("getDoctorFollowUpsToday", () => {
  it("returns a follow-up scheduled for today", async () => {
    const followUps = await getDoctorFollowUpsToday(CLINIC, DR_SAMEERA, TODAY);
    const names = followUps.map((f) => f.patientName);

    expect(names).toContain("Diya Prakash");
  });

  it("carries the diagnosis from that visit's consultation", async () => {
    const followUps = await getDoctorFollowUpsToday(CLINIC, DR_SAMEERA, TODAY);
    const diya = followUps.find((f) => f.patientName === "Diya Prakash");

    expect(diya?.diagnosis).toBe("Viral fever");
  });

  it("excludes follow-ups scheduled for other days", async () => {
    const followUps = await getDoctorFollowUpsToday(
      CLINIC,
      DR_SAMEERA,
      "2026-03-10",
    );
    expect(followUps.map((f) => f.patientName)).not.toContain("Diya Prakash");
  });

  it("is scoped to the treating doctor", async () => {
    const followUps = await getDoctorFollowUpsToday(CLINIC, DR_ANAND, TODAY);
    expect(followUps.map((f) => f.patientName)).not.toContain("Diya Prakash");
  });

  it("is scoped to the clinic", async () => {
    expect(await getDoctorFollowUpsToday(OTHER_CLINIC, DR_SAMEERA, TODAY)).toEqual(
      [],
    );
  });
});
