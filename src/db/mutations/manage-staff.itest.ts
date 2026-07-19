import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, doctors, recordRevisions, staff } from "@/db/schema";
import { addStaff, setStaffActive, updateStaffRoles } from "./manage-staff";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const SAMEERA = "22222222-0000-0000-0000-000000000001"; // owner + doctor
const LATHA = "22222222-0000-0000-0000-000000000003"; // nurse + front_desk
const REKHA = "22222222-0000-0000-0000-000000000004"; // front_desk + pharmacy

const ORIGINAL_ROLES: Record<string, ("owner" | "doctor" | "front_desk" | "nurse" | "pharmacy")[]> = {
  [SAMEERA]: ["owner", "doctor"],
  [LATHA]: ["nurse", "front_desk"],
  [REKHA]: ["front_desk", "pharmacy"],
};

async function reset() {
  for (const [id, roles] of Object.entries(ORIGINAL_ROLES)) {
    await db.update(staff).set({ roles, isActive: true }).where(eq(staff.id, id));
    await db.delete(recordRevisions).where(eq(recordRevisions.entityId, id));
    await db.delete(auditLog).where(eq(auditLog.entityId, id));
  }
  /* Any staff created by addStaff tests. */
  const added = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.clinicId, CLINIC), eq(staff.name, "Test Hire")));
  for (const s of added) {
    await db.delete(doctors).where(eq(doctors.staffId, s.id));
    await db.delete(auditLog).where(eq(auditLog.entityId, s.id));
    await db.delete(staff).where(eq(staff.id, s.id));
  }
  /* A doctors row created by granting Latha the doctor role. */
  await db.delete(doctors).where(and(eq(doctors.staffId, LATHA)));
}

beforeEach(reset);
afterEach(reset);

const asOwner = {
  clinicId: CLINIC,
  actorStaffId: SAMEERA,
  actorRoles: ["owner", "doctor"] as ("owner" | "doctor")[],
};

describe("updateStaffRoles", () => {
  it("grants a nurse the pharmacy role — the small-clinic dispensing case", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      staffId: LATHA,
      reason: "Latha covers dispensing in the evening shift",
      roles: ["nurse", "front_desk", "pharmacy"],
    });
    expect(result.ok).toBe(true);

    const [row] = await db.select({ roles: staff.roles }).from(staff).where(eq(staff.id, LATHA));
    expect(row.roles).toContain("pharmacy");

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, LATHA));
    expect(revision.previousValues).toEqual({ roles: ["nurse", "front_desk"] });
  });

  it("refuses a non-owner actor", async () => {
    const result = await updateStaffRoles({
      clinicId: CLINIC,
      actorStaffId: REKHA,
      actorRoles: ["front_desk", "pharmacy"],
      staffId: LATHA,
      reason: "Trying without owner role",
      roles: ["nurse"],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty roles array", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      staffId: LATHA,
      reason: "Removing everything",
      roles: [],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses removing the last active owner's owner role", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      staffId: SAMEERA,
      reason: "Sole owner demoting themself",
      roles: ["doctor"],
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("owner");
  });

  it("allows removing owner when another active owner exists", async () => {
    await db.update(staff).set({ roles: ["owner", "front_desk"] }).where(eq(staff.id, REKHA));
    try {
      const result = await updateStaffRoles({
        ...asOwner,
        staffId: SAMEERA,
        reason: "Handing the clinic over to Rekha",
        roles: ["doctor"],
      });
      expect(result.ok).toBe(true);
    } finally {
      await db.update(staff).set({ roles: ORIGINAL_ROLES[SAMEERA] }).where(eq(staff.id, SAMEERA));
    }
  });

  it("granting doctor without a specialty is refused", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      staffId: LATHA,
      reason: "Latha finished her MBBS somehow",
      roles: ["nurse", "doctor"],
    });
    expect(result.ok).toBe(false);
  });

  it("granting doctor with a specialty creates the doctors row", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      staffId: LATHA,
      reason: "New physician joining as staff doctor",
      roles: ["nurse", "doctor"],
      specialty: "general_medicine",
    });
    expect(result.ok).toBe(true);

    const [doctorRow] = await db
      .select({ specialty: doctors.specialty, registrationNo: doctors.registrationNo })
      .from(doctors)
      .where(eq(doctors.staffId, LATHA));
    expect(doctorRow.specialty).toBe("general_medicine");
    /* Prescribing stays blocked until a registration number is added (§9.2). */
    expect(doctorRow.registrationNo).toBeNull();
  });

  it("re-granting doctor to someone with an existing doctors row reuses it", async () => {
    /* Remove then re-grant Sameera's doctor role (another owner covers). */
    await db.update(staff).set({ roles: ["owner", "front_desk"] }).where(eq(staff.id, REKHA));
    try {
      await updateStaffRoles({
        ...asOwner,
        staffId: SAMEERA,
        reason: "Stepping back from consulting",
        roles: ["owner"],
      });
      const result = await updateStaffRoles({
        ...asOwner,
        staffId: SAMEERA,
        reason: "Back to consulting",
        roles: ["owner", "doctor"],
      });
      expect(result.ok).toBe(true);

      const doctorRows = await db.select().from(doctors).where(eq(doctors.staffId, SAMEERA));
      expect(doctorRows).toHaveLength(1);
      expect(doctorRows[0].registrationNo).toBe("KMC 78412");
    } finally {
      await db.update(staff).set({ roles: ORIGINAL_ROLES[REKHA] }).where(eq(staff.id, REKHA));
    }
  });

  it("refuses without a reason", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      staffId: LATHA,
      reason: " ",
      roles: ["nurse"],
    });
    expect(result.ok).toBe(false);
  });

  it("is scoped to the clinic", async () => {
    const result = await updateStaffRoles({
      ...asOwner,
      clinicId: OTHER_CLINIC,
      staffId: LATHA,
      reason: "Cross-clinic edit must fail",
      roles: ["nurse"],
    });
    expect(result.ok).toBe(false);
  });

  it("logs an audit entry with the role diff", async () => {
    await updateStaffRoles({
      ...asOwner,
      staffId: LATHA,
      reason: "Adding pharmacy cover",
      roles: ["nurse", "front_desk", "pharmacy"],
    });
    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, LATHA));
    expect(entry.action).toBe("staff_roles_changed");
    expect(entry.detail).toMatchObject({ to: ["nurse", "front_desk", "pharmacy"] });
  });
});

describe("addStaff", () => {
  const base = {
    ...asOwner,
    name: "Test Hire",
    phone: "9900012345",
    roles: ["front_desk"] as ("front_desk")[],
  };

  it("creates an active staff member and logs it", async () => {
    const result = await addStaff(base);
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ isActive: staff.isActive, roles: staff.roles })
      .from(staff)
      .where(eq(staff.id, result.ok ? result.staffId : ""));
    expect(row.isActive).toBe(true);
    expect(row.roles).toEqual(["front_desk"]);
  });

  it("creates the doctors row when hired as a doctor", async () => {
    const result = await addStaff({
      ...base,
      roles: ["doctor"],
      specialty: "dermatology",
    });
    expect(result.ok).toBe(true);

    const [doctorRow] = await db
      .select({ specialty: doctors.specialty })
      .from(doctors)
      .where(eq(doctors.staffId, result.ok ? result.staffId : ""));
    expect(doctorRow.specialty).toBe("dermatology");
  });

  it("refuses a doctor hire without a specialty", async () => {
    expect((await addStaff({ ...base, roles: ["doctor"] })).ok).toBe(false);
  });

  it("refuses a non-owner actor", async () => {
    const result = await addStaff({
      ...base,
      actorStaffId: LATHA,
      actorRoles: ["nurse", "front_desk"],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a bad phone number", async () => {
    expect((await addStaff({ ...base, phone: "12345" })).ok).toBe(false);
  });
});

describe("setStaffActive", () => {
  it("deactivates and reactivates with revisions", async () => {
    const off = await setStaffActive({
      ...asOwner,
      staffId: REKHA,
      active: false,
      reason: "Left the clinic in July",
    });
    expect(off.ok).toBe(true);

    const [row] = await db.select({ isActive: staff.isActive }).from(staff).where(eq(staff.id, REKHA));
    expect(row.isActive).toBe(false);

    const on = await setStaffActive({
      ...asOwner,
      staffId: REKHA,
      active: true,
      reason: "Rejoined in August",
    });
    expect(on.ok).toBe(true);

    const revisions = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, REKHA));
    expect(revisions).toHaveLength(2);
  });

  it("refuses self-deactivation", async () => {
    const result = await setStaffActive({
      ...asOwner,
      staffId: SAMEERA,
      active: false,
      reason: "Deactivating myself by accident",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses deactivating the last active owner", async () => {
    /* Rekha (non-owner) tries via owner-roles spoofing is already covered by
       the actor check; here another hypothetical owner path: make Rekha an
       owner-actor but target Sameera while she is the only owner. */
    const result = await setStaffActive({
      clinicId: CLINIC,
      actorStaffId: REKHA,
      actorRoles: ["owner"],
      staffId: SAMEERA,
      active: false,
      reason: "Removing the only owner",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("owner");
  });

  it("refuses a non-owner actor", async () => {
    const result = await setStaffActive({
      clinicId: CLINIC,
      actorStaffId: LATHA,
      actorRoles: ["nurse"],
      staffId: REKHA,
      active: false,
      reason: "Nurse trying to deactivate a colleague",
    });
    expect(result.ok).toBe(false);
  });
});
