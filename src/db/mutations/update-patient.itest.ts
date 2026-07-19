import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, patients, recordRevisions } from "@/db/schema";
import { updatePatientDemographics } from "./update-patient";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000004";
const NAGARAJ = "44444444-0000-0000-0000-000000000007";

const ORIGINAL = {
  name: "Nagaraj K",
  phone: "9448112233",
  guardianName: "Kavitha N",
  sex: "male" as const,
};

async function reset() {
  await db.update(patients).set(ORIGINAL).where(eq(patients.id, NAGARAJ));
  await db
    .delete(recordRevisions)
    .where(eq(recordRevisions.entityId, NAGARAJ));
  await db.delete(auditLog).where(eq(auditLog.entityId, NAGARAJ));
}

beforeEach(reset);
afterEach(reset);

describe("updatePatientDemographics", () => {
  it("updates the field and writes a revision with the pre-edit value", async () => {
    const result = await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "Phone number was mistyped at registration",
      edits: { phone: "9448199999" },
    });
    expect(result.ok).toBe(true);

    const [patient] = await db.select().from(patients).where(eq(patients.id, NAGARAJ));
    expect(patient.phone).toBe("9448199999");

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, NAGARAJ));
    expect(revision.previousValues).toEqual({ phone: "9448112233" });
    expect(revision.reason).toBe("Phone number was mistyped at registration");
  });

  it("only records fields that actually changed", async () => {
    await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "Correcting the name spelling",
      edits: { name: "Nagaraj K.", phone: ORIGINAL.phone },
    });

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, NAGARAJ));
    expect(Object.keys(revision.previousValues as object)).toEqual(["name"]);
  });

  it("refuses an edit with no reason", async () => {
    const result = await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "  ",
      edits: { name: "Someone Else" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses when nothing actually changed", async () => {
    const result = await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "No real change here",
      edits: { name: ORIGINAL.name },
    });
    expect(result.ok).toBe(false);
  });

  it("logs an audit entry naming the changed fields", async () => {
    await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "Family moved, updated contact number",
      edits: { phone: "9448177777" },
    });

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, NAGARAJ));
    expect(entry.action).toBe("patient_corrected");
    expect(entry.detail).toMatchObject({ fields: ["phone"] });
  });

  it("is scoped to the clinic", async () => {
    const result = await updatePatientDemographics({
      clinicId: "99999999-9999-9999-9999-999999999999",
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "Should not resolve across clinics",
      edits: { name: "Someone Else" },
    });
    expect(result.ok).toBe(false);
  });

  it("edits the guardian's name", async () => {
    const result = await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "Guardian changed after custody arrangement",
      edits: { guardianName: "Suresh N" },
    });
    expect(result.ok).toBe(true);

    const [patient] = await db.select().from(patients).where(eq(patients.id, NAGARAJ));
    expect(patient.guardianName).toBe("Suresh N");

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, NAGARAJ));
    expect(revision.previousValues).toEqual({ guardianName: "Kavitha N" });
  });

  it("edits sex", async () => {
    const result = await updatePatientDemographics({
      clinicId: CLINIC,
      patientId: NAGARAJ,
      actorStaffId: STAFF,
      reason: "Sex was recorded incorrectly at registration",
      edits: { sex: "other" },
    });
    expect(result.ok).toBe(true);

    const [patient] = await db.select().from(patients).where(eq(patients.id, NAGARAJ));
    expect(patient.sex).toBe("other");
  });
});
