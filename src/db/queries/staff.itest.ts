import { describe, expect, it } from "vitest";
import { getAuditLog, getStaff, resolveStaffIdentity } from "./staff";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const SAMEERA = "22222222-0000-0000-0000-000000000001";
const REKHA = "22222222-0000-0000-0000-000000000004";

describe("getStaff", () => {
  it("lists the clinic's staff", async () => {
    const staff = await getStaff(CLINIC);
    expect(staff.length).toBeGreaterThanOrEqual(4);
  });

  it("resolves a doctor's registration number", async () => {
    const staff = await getStaff(CLINIC);
    const sameera = staff.find((s) => s.name === "Dr. Sameera Rahman")!;

    expect(sameera.isDoctor).toBe(true);
    expect(sameera.registrationNo).toBe("KMC 78412");
  });

  it("exposes the doctor who cannot prescribe (no registration)", async () => {
    const staff = await getStaff(CLINIC);
    const anand = staff.find((s) => s.name === "Dr. Anand Gowda")!;

    expect(anand.isDoctor).toBe(true);
    expect(anand.registrationNo).toBeNull();
  });

  it("lists a non-doctor without a registration number", async () => {
    /* The left join must not drop nurses/front-desk staff. */
    const staff = await getStaff(CLINIC);
    const latha = staff.find((s) => s.name === "Latha Bai")!;

    expect(latha.isDoctor).toBe(false);
    expect(latha.roles).toContain("nurse");
  });

  it("is scoped to the clinic", async () => {
    expect(await getStaff(OTHER_CLINIC)).toEqual([]);
  });
});

describe("resolveStaffIdentity", () => {
  it("resolves a doctor's identity, including the doctors.id (not staff.id)", async () => {
    const identity = await resolveStaffIdentity(CLINIC, SAMEERA);

    expect(identity?.name).toBe("Dr. Sameera Rahman");
    expect(identity?.roles).toContain("owner");
    expect(identity?.doctorId).not.toBeNull();
    expect(identity?.doctorId).not.toBe(SAMEERA);
    expect(identity?.specialty).toBeTruthy();
  });

  it("returns null doctorId/specialty for non-doctor staff", async () => {
    const identity = await resolveStaffIdentity(CLINIC, REKHA);

    expect(identity?.name).toBe("Rekha S");
    expect(identity?.doctorId).toBeNull();
    expect(identity?.specialty).toBeNull();
  });

  it("returns null for a staff id outside the clinic", async () => {
    expect(await resolveStaffIdentity(OTHER_CLINIC, SAMEERA)).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    expect(
      await resolveStaffIdentity(CLINIC, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});

describe("getAuditLog", () => {
  it("is scoped to the clinic", async () => {
    expect(await getAuditLog(OTHER_CLINIC)).toEqual([]);
  });

  it("returns entries newest-first", async () => {
    /* Depends on prior flows having written entries; if the DB was only just
       seeded there may be none, so this asserts ordering only when populated. */
    const log = await getAuditLog(CLINIC);
    for (let i = 1; i < log.length; i++) {
      expect(log[i - 1].at.getTime()).toBeGreaterThanOrEqual(
        log[i].at.getTime(),
      );
    }
  });

  it("respects the limit", async () => {
    const log = await getAuditLog(CLINIC, 2);
    expect(log.length).toBeLessThanOrEqual(2);
  });
});
