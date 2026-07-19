import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, doctors, recordRevisions, staff } from "@/db/schema";
import { updateStaffDetails } from "./update-staff-details";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const SAMEERA = "22222222-0000-0000-0000-000000000001"; // owner + doctor
const ANAND = "22222222-0000-0000-0000-000000000002"; // doctor, NO registration no.
const LATHA = "22222222-0000-0000-0000-000000000003"; // nurse + front_desk
const REKHA = "22222222-0000-0000-0000-000000000004"; // front_desk + pharmacy

const asOwner = {
  clinicId: CLINIC,
  actorStaffId: SAMEERA,
  actorRoles: ["owner", "doctor"] as ("owner" | "doctor")[],
};

async function reset() {
  await db
    .update(staff)
    .set({ name: "Dr. Anand Gowda", phone: "9845003344", qualification: "MBBS", isActive: true })
    .where(eq(staff.id, ANAND));
  await db
    .update(staff)
    .set({ name: "Latha Bai", phone: "9845005566", qualification: "GNM", isActive: true })
    .where(eq(staff.id, LATHA));
  await db
    .update(doctors)
    .set({ registrationNo: null, registrationCouncil: null, specialty: "pediatrics" })
    .where(eq(doctors.staffId, ANAND));
  for (const id of [ANAND, LATHA, SAMEERA, REKHA]) {
    await db.delete(recordRevisions).where(eq(recordRevisions.entityId, id));
    await db.delete(auditLog).where(eq(auditLog.entityId, id));
  }
}

beforeEach(reset);
afterEach(reset);

describe("the registration dead end this exists to fix (§9.2)", () => {
  it("lets the owner give a doctor a registration number, unblocking prescribing", async () => {
    const before = await db
      .select({ reg: doctors.registrationNo })
      .from(doctors)
      .where(eq(doctors.staffId, ANAND));
    expect(before[0].reg).toBeNull();

    const result = await updateStaffDetails({
      ...asOwner,
      staffId: ANAND,
      reason: "Council registration verified from his certificate",
      edits: { registrationNo: "KMC 91204", registrationCouncil: "Karnataka Medical Council" },
    });
    expect(result.ok).toBe(true);

    const [after] = await db
      .select({ reg: doctors.registrationNo, council: doctors.registrationCouncil })
      .from(doctors)
      .where(eq(doctors.staffId, ANAND));
    expect(after.reg).toBe("KMC 91204");
    expect(after.council).toBe("Karnataka Medical Council");
  });

  it("records the prior (empty) registration in the revision trail", async () => {
    await updateStaffDetails({
      ...asOwner,
      staffId: ANAND,
      reason: "Adding his council registration",
      edits: { registrationNo: "KMC 91204" },
    });

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, ANAND));
    expect(revision.previousValues).toEqual({ registrationNo: null });
    expect(revision.reason).toBe("Adding his council registration");
  });
});

describe("self-editing", () => {
  it("lets a doctor add their own registration without the owner", async () => {
    const result = await updateStaffDetails({
      clinicId: CLINIC,
      staffId: ANAND,
      actorStaffId: ANAND,
      actorRoles: ["doctor"],
      reason: "Entering my own council registration",
      edits: { registrationNo: "KMC 91204" },
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a non-owner editing someone else", async () => {
    const result = await updateStaffDetails({
      clinicId: CLINIC,
      staffId: ANAND,
      actorStaffId: LATHA,
      actorRoles: ["nurse", "front_desk"],
      reason: "Nurse editing a doctor's registration",
      edits: { registrationNo: "FAKE 1" },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("your own");
  });
});

describe("staff fields", () => {
  it("updates name, phone and qualification for a non-doctor", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: LATHA,
      reason: "Corrected her surname and new mobile",
      edits: { name: "Latha Bai M", phone: "98450 77771", qualification: "GNM, RN" },
    });
    expect(result.ok).toBe(true);

    const [after] = await db
      .select({ name: staff.name, phone: staff.phone, q: staff.qualification })
      .from(staff)
      .where(eq(staff.id, LATHA));
    expect(after.name).toBe("Latha Bai M");
    /* Non-digits stripped, matching registration's own normalisation. */
    expect(after.phone).toBe("9845077771");
    expect(after.q).toBe("GNM, RN");
  });

  it("ignores doctor-only fields for a non-doctor rather than erroring", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: LATHA,
      reason: "One form serves both, so this must not blow up",
      edits: { qualification: "GNM, RN", registrationNo: "SHOULD BE IGNORED" },
    });
    expect(result.ok).toBe(true);

    const rows = await db.select().from(doctors).where(eq(doctors.staffId, LATHA));
    expect(rows).toHaveLength(0);
  });

  it("changes a doctor's specialty", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: ANAND,
      reason: "He practises general medicine now",
      edits: { specialty: "general_medicine" },
    });
    expect(result.ok).toBe(true);

    const [after] = await db
      .select({ s: doctors.specialty })
      .from(doctors)
      .where(eq(doctors.staffId, ANAND));
    expect(after.s).toBe("general_medicine");
  });
});

describe("guards", () => {
  it("refuses an unknown specialty", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: ANAND,
      reason: "Trying an invented specialty",
      edits: { specialty: "astrology" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a short phone number", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: LATHA,
      reason: "Bad phone number",
      edits: { phone: "12345" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses without a reason", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: ANAND,
      reason: " ",
      edits: { registrationNo: "KMC 91204" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a no-op edit", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: LATHA,
      reason: "Saving the same values back",
      edits: { name: "Latha Bai" },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("No changes");
  });

  it("refuses editing a deactivated member", async () => {
    await db.update(staff).set({ isActive: false }).where(eq(staff.id, LATHA));
    const result = await updateStaffDetails({
      ...asOwner,
      staffId: LATHA,
      reason: "Editing someone who has left",
      edits: { qualification: "GNM, RN" },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Reactivate");
  });

  it("is scoped to the clinic", async () => {
    const result = await updateStaffDetails({
      ...asOwner,
      clinicId: OTHER_CLINIC,
      staffId: ANAND,
      reason: "Cross-clinic edit must fail",
      edits: { registrationNo: "KMC 91204" },
    });
    expect(result.ok).toBe(false);
  });

  it("cannot change roles through this path", async () => {
    /* Roles stay owner-only in manage-staff.ts; if this ever starts
       accepting them, self-editing becomes self-promotion. */
    await updateStaffDetails({
      clinicId: CLINIC,
      staffId: LATHA,
      actorStaffId: LATHA,
      actorRoles: ["nurse", "front_desk"],
      reason: "Editing my own profile",
      edits: { qualification: "GNM, RN", ...({ roles: ["owner"] } as object) },
    });

    const [after] = await db.select({ roles: staff.roles }).from(staff).where(eq(staff.id, LATHA));
    expect(after.roles).not.toContain("owner");
  });
});

describe("audit", () => {
  it("names the changed fields without leaking their values", async () => {
    await updateStaffDetails({
      ...asOwner,
      staffId: ANAND,
      reason: "Council registration verified",
      edits: { registrationNo: "KMC 91204", registrationCouncil: "Karnataka Medical Council" },
    });

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, ANAND));
    expect(entry.action).toBe("staff_details_updated");
    expect(entry.detail).toMatchObject({
      changed: ["registrationNo", "registrationCouncil"],
    });
  });
});
