import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, patients, visits } from "@/db/schema";
import { mergePatientRecords } from "./merge-patients";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const STAFF = "22222222-0000-0000-0000-000000000004";
const DOCTOR = "33333333-0000-0000-0000-000000000001";

/* Scoped to this file so a failure cannot corrupt the seeded scenario. */
const KEEP = "aaaa0000-0000-0000-0000-00000000000a";
const DUPE = "aaaa0000-0000-0000-0000-00000000000b";

async function resetFixtures() {
  await db.delete(auditLog).where(eq(auditLog.entityId, KEEP));
  await db.delete(visits).where(eq(visits.patientId, KEEP));
  await db.delete(visits).where(eq(visits.patientId, DUPE));
  await db.delete(patients).where(eq(patients.id, KEEP));
  await db.delete(patients).where(eq(patients.id, DUPE));

  await db.insert(patients).values([
    {
      id: KEEP,
      clinicId: CLINIC,
      name: "Ramesh Kumar",
      phone: "9000000001",
      sex: "male",
      ageYears: 51,
      allergies: ["Penicillin"],
    },
    {
      id: DUPE,
      clinicId: CLINIC,
      name: "Ramesh K",
      phone: "9000000001",
      sex: "male",
      ageYears: 51,
    },
  ]);

  /* Two visits on the duplicate — the history that must survive the merge. */
  await db.insert(visits).values([
    { clinicId: CLINIC, patientId: DUPE, doctorId: DOCTOR, visitDate: "2026-02-11" },
    { clinicId: CLINIC, patientId: DUPE, doctorId: DOCTOR, visitDate: "2026-05-04" },
  ]);
}

beforeEach(resetFixtures);

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.entityId, KEEP));
  await db.delete(visits).where(eq(visits.patientId, KEEP));
  await db.delete(visits).where(eq(visits.patientId, DUPE));
  await db.delete(patients).where(eq(patients.id, KEEP));
  await db.delete(patients).where(eq(patients.id, DUPE));
});

const merge = () =>
  mergePatientRecords({
    clinicId: CLINIC,
    actorStaffId: STAFF,
    survivorId: KEEP,
    duplicateId: DUPE,
  });

describe("history survives the merge", () => {
  it("moves every visit onto the survivor", async () => {
    /* The property that matters most: a merge stranding history leaves the
       doctor with two partial records and trust in neither. */
    const result = await merge();

    expect(result).toEqual({ ok: true, movedVisits: 2 });

    const kept = await db
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.clinicId, CLINIC), eq(visits.patientId, KEEP)));

    expect(kept).toHaveLength(2);
  });

  it("leaves no visit behind on the duplicate", async () => {
    await merge();

    const stranded = await db
      .select({ id: visits.id })
      .from(visits)
      .where(eq(visits.patientId, DUPE));

    expect(stranded).toEqual([]);
  });
});

describe("the duplicate is archived, never deleted", () => {
  it("keeps the row and marks where it went (§9.6)", async () => {
    await merge();

    const [row] = await db
      .select({
        id: patients.id,
        mergedIntoId: patients.mergedIntoId,
        archivedAt: patients.archivedAt,
      })
      .from(patients)
      .where(eq(patients.id, DUPE));

    expect(row).toBeDefined();
    expect(row.mergedIntoId).toBe(KEEP);
    expect(row.archivedAt).not.toBeNull();
  });

  it("leaves the survivor untouched and unarchived", async () => {
    await merge();

    const [row] = await db
      .select({
        archivedAt: patients.archivedAt,
        mergedIntoId: patients.mergedIntoId,
        allergies: patients.allergies,
      })
      .from(patients)
      .where(eq(patients.id, KEEP));

    expect(row.archivedAt).toBeNull();
    expect(row.mergedIntoId).toBeNull();
    /* The allergy is exactly what survivor selection exists to protect. */
    expect(row.allergies).toEqual(["Penicillin"]);
  });
});

describe("audit trail", () => {
  it("records the merge with both names and the visit count", async () => {
    await merge();

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, KEEP));

    expect(entry.action).toBe("patient_merged");
    expect(entry.detail).toMatchObject({
      survivorName: "Ramesh Kumar",
      duplicateName: "Ramesh K",
      movedVisits: 2,
    });
  });
});

describe("refusals", () => {
  it("refuses to merge a record into itself", async () => {
    const result = await mergePatientRecords({
      clinicId: CLINIC,
      actorStaffId: STAFF,
      survivorId: KEEP,
      duplicateId: KEEP,
    });

    expect(result).toEqual({
      ok: false,
      error: "Cannot merge a record into itself",
    });
  });

  it("refuses a second merge of the same duplicate", async () => {
    /* Double submit, or two tablets racing. The second must not re-run and
       re-log work that already happened. */
    await merge();
    const second = await merge();

    expect(second).toEqual({
      ok: false,
      error: "That record was already merged",
    });
  });

  it("refuses to merge into a record that was itself merged away", async () => {
    await merge();

    const result = await mergePatientRecords({
      clinicId: CLINIC,
      actorStaffId: STAFF,
      survivorId: DUPE,
      duplicateId: KEEP,
    });

    expect(result.ok).toBe(false);
  });

  it("refuses across clinics", async () => {
    const result = await mergePatientRecords({
      clinicId: OTHER_CLINIC,
      actorStaffId: STAFF,
      survivorId: KEEP,
      duplicateId: DUPE,
    });

    expect(result).toEqual({ ok: false, error: "Patient not found" });
  });

  it("changes nothing when it refuses", async () => {
    await mergePatientRecords({
      clinicId: OTHER_CLINIC,
      actorStaffId: STAFF,
      survivorId: KEEP,
      duplicateId: DUPE,
    });

    const [row] = await db
      .select({ mergedIntoId: patients.mergedIntoId })
      .from(patients)
      .where(eq(patients.id, DUPE));

    expect(row.mergedIntoId).toBeNull();
  });
});
