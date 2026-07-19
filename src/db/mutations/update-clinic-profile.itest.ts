import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, clinics, recordRevisions } from "@/db/schema";
import { updateClinicProfile } from "./update-clinic-profile";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const SAMEERA = "22222222-0000-0000-0000-000000000001"; // owner
const REKHA = "22222222-0000-0000-0000-000000000004"; // front_desk + pharmacy

const asOwner = {
  clinicId: CLINIC,
  actorStaffId: SAMEERA,
  actorRoles: ["owner", "doctor"] as ("owner" | "doctor")[],
};

/* The seeded profile, restored after each test. */
const SEEDED = {
  name: "Vatsalya Child Care",
  phone: "08212468800",
  addressLine: "2nd Cross, Hunsur Main Road",
  city: "Mysuru",
  pincode: "570017",
  ceaRegistrationNo: "KA/CEA/2024/11872",
  isGstRegistered: true,
  gstin: "29ABCDE1234F1Z5",
};

afterEach(async () => {
  await db.update(clinics).set(SEEDED).where(eq(clinics.id, CLINIC));
  await db.delete(recordRevisions).where(eq(recordRevisions.entityId, CLINIC));
  await db.delete(auditLog).where(eq(auditLog.entityId, CLINIC));
});

describe("updateClinicProfile", () => {
  it("corrects the clinic's name and address", async () => {
    const result = await updateClinicProfile({
      ...asOwner,
      reason: "Clinic moved premises in July",
      edits: { name: "Vatsalya Child Care & Vaccination", city: "Mandya" },
    });
    expect(result.ok).toBe(true);

    const [after] = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
    expect(after.name).toBe("Vatsalya Child Care & Vaccination");
    expect(after.city).toBe("Mandya");
    /* Untouched fields must survive a partial edit. */
    expect(after.ceaRegistrationNo).toBe(SEEDED.ceaRegistrationNo);
  });

  it("records only the changed fields in the revision", async () => {
    await updateClinicProfile({
      ...asOwner,
      reason: "New landline after the move",
      edits: { phone: "0821 555 0100" },
    });

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, CLINIC));
    expect(revision.previousValues).toEqual({ phone: SEEDED.phone });
    expect(revision.entityTable).toBe("clinics");
  });

  it("strips non-digits from phone and pincode", async () => {
    await updateClinicProfile({
      ...asOwner,
      reason: "Correcting the contact details",
      edits: { phone: "0821 555 0100", pincode: "570 018" },
    });

    const [after] = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
    expect(after.phone).toBe("08215550100");
    expect(after.pincode).toBe("570018");
  });
});

describe("the GST pair", () => {
  it("clears the GSTIN when registration is switched off", async () => {
    /* A stale GSTIN left behind would print on the next bill. */
    const result = await updateClinicProfile({
      ...asOwner,
      reason: "Fell below the GST threshold this year",
      edits: { isGstRegistered: false },
    });
    expect(result.ok).toBe(true);

    const [after] = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
    expect(after.isGstRegistered).toBe(false);
    expect(after.gstin).toBeNull();
  });

  it("refuses to switch registration on without a GSTIN", async () => {
    await db
      .update(clinics)
      .set({ isGstRegistered: false, gstin: null })
      .where(eq(clinics.id, CLINIC));

    const result = await updateClinicProfile({
      ...asOwner,
      reason: "Registering for GST",
      edits: { isGstRegistered: true },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("GSTIN");
  });

  it("accepts switching registration on together with a GSTIN", async () => {
    await db
      .update(clinics)
      .set({ isGstRegistered: false, gstin: null })
      .where(eq(clinics.id, CLINIC));

    const result = await updateClinicProfile({
      ...asOwner,
      reason: "Registered for GST this quarter",
      edits: { isGstRegistered: true, gstin: "29ZZZZZ9999Z1Z9" },
    });
    expect(result.ok).toBe(true);

    const [after] = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
    expect(after.gstin).toBe("29ZZZZZ9999Z1Z9");
  });
});

describe("guards", () => {
  it("refuses a non-owner", async () => {
    const result = await updateClinicProfile({
      clinicId: CLINIC,
      actorStaffId: REKHA,
      actorRoles: ["front_desk", "pharmacy"],
      reason: "Front desk trying to rename the clinic",
      edits: { name: "Not Allowed Clinic" },
    });
    expect(result.ok).toBe(false);

    const [after] = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
    expect(after.name).toBe(SEEDED.name);
  });

  it("refuses without a reason", async () => {
    const result = await updateClinicProfile({
      ...asOwner,
      reason: " ",
      edits: { city: "Mandya" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty name", async () => {
    const result = await updateClinicProfile({
      ...asOwner,
      reason: "Trying to blank the name",
      edits: { name: " " },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a no-op edit", async () => {
    const result = await updateClinicProfile({
      ...asOwner,
      reason: "Saving identical values",
      edits: { name: SEEDED.name, city: SEEDED.city },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("No changes");
  });

  it("refuses an unknown clinic", async () => {
    const result = await updateClinicProfile({
      ...asOwner,
      clinicId: "99999999-9999-9999-9999-999999999999",
      reason: "Editing a clinic that does not exist",
      edits: { city: "Nowhere" },
    });
    expect(result.ok).toBe(false);
  });
});

describe("audit", () => {
  it("names the changed fields", async () => {
    await updateClinicProfile({
      ...asOwner,
      reason: "Moved premises",
      edits: { addressLine: "9 Church Street", city: "Bengaluru" },
    });

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, CLINIC));
    expect(entry.action).toBe("clinic_profile_updated");
    expect(entry.detail).toMatchObject({ changed: ["addressLine", "city"] });
  });
});
