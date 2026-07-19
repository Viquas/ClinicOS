import { describe, expect, it } from "vitest";
import { getClinicProfile } from "./clinic";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const MISSING = "99999999-9999-9999-9999-999999999999";

describe("getClinicProfile", () => {
  it("returns the seeded clinic's profile", async () => {
    const clinic = await getClinicProfile(CLINIC);
    expect(clinic?.name).toBe("Vatsalya Child Care");
    expect(clinic?.city).toBe("Mysuru");
    expect(clinic?.primarySpecialty).toBe("pediatrics");
  });

  it("derives nav initials from the clinic name", async () => {
    const clinic = await getClinicProfile(CLINIC);
    expect(clinic?.initials).toBe("VC");
  });

  it("returns null for a clinic that does not exist", async () => {
    /* The stale-cookie path depends on this being null rather than throwing:
       a cookie naming a deleted clinic used to take the whole app down. */
    expect(await getClinicProfile(MISSING)).toBeNull();
  });
});
