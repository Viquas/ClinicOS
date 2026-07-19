import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { patients, recordRevisions } from "@/db/schema";
import {
  getFamily,
  getPatient,
  getPatientTimeline,
  listPatients,
  searchPatients,
} from "./patients";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const AARAV = "44444444-0000-0000-0000-000000000001";

describe("listPatients", () => {
  it("returns the clinic's patients", async () => {
    const list = await listPatients(CLINIC);
    /* A property, not a count: earlier this asserted a hardcoded 7 and broke
       the moment a merge ran, because the seeded row count is mutable state. */
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((p) => p.name)).toContain("Aarav Prakash");
  });

  it("excludes a merged record even if it was never archived", async () => {
    /*
     * The mergedIntoId filter earns its place only here. A merged record is
     * normally archived too, so filtering on archivedAt alone would look
     * correct — an earlier version of this test passed with the mergedIntoId
     * filter deleted, which is how that redundancy was found.
     *
     * This constructs the case the filter actually defends: a record pointed
     * at a survivor but left unarchived. It must not resurface in search, or
     * front desk reopens the duplicate they just resolved.
     */
    const GHOST = "cccc0000-0000-0000-0000-00000000000c";

    await db.delete(patients).where(eq(patients.id, GHOST));
    await db.insert(patients).values({
      id: GHOST,
      clinicId: CLINIC,
      name: "Ghost Duplicate",
      phone: "9000000099",
      sex: "male",
      ageYears: 40,
      mergedIntoId: AARAV,
      /* Deliberately NOT archived. */
    });

    try {
      const names = (await listPatients(CLINIC)).map((p) => p.name);
      expect(names).not.toContain("Ghost Duplicate");

      const found = await searchPatients(CLINIC, "Ghost");
      expect(found).toEqual([]);
    } finally {
      await db.delete(patients).where(eq(patients.id, GHOST));
    }
  });

  it("is scoped to the clinic", async () => {
    expect(await listPatients(OTHER_CLINIC)).toEqual([]);
  });

  it("returns empty arrays rather than null for allergies and tags", async () => {
    /* The columns default to '[]' but a hand-inserted row can leave them
       null, and the UI maps over them unguarded. */
    const list = await listPatients(CLINIC);
    expect(list.every((p) => Array.isArray(p.allergies))).toBe(true);
    expect(list.every((p) => Array.isArray(p.tags))).toBe(true);
  });
});

describe("searchPatients", () => {
  it("finds a patient by the last four digits of their phone", async () => {
    /* The §7.1 fast path — what a patient recites from memory. */
    const results = await searchPatients(CLINIC, "2233");
    const names = results.map((p) => p.name);

    expect(names).toContain("Aarav Prakash");
    expect(names).toContain("Diya Prakash");
  });

  it("finds a patient by partial name, case-insensitively", async () => {
    const results = await searchPatients(CLINIC, "lakshmi");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("lakshmi");
  });

  it("returns nothing for a query under two characters", async () => {
    /* Guard against a single keystroke returning the entire register. */
    expect(await searchPatients(CLINIC, "9")).toEqual([]);
    expect(await searchPatients(CLINIC, "")).toEqual([]);
  });

  it("returns nothing for a non-match", async () => {
    expect(await searchPatients(CLINIC, "zzzznotapatient")).toEqual([]);
  });

  it("does not leak across clinics", async () => {
    expect(await searchPatients(OTHER_CLINIC, "2233")).toEqual([]);
  });
});

describe("getFamily", () => {
  it("returns every person sharing a phone number", async () => {
    /* Two siblings on the parent's phone — the pediatric default, not an
       edge case (§7.1). */
    const family = await getFamily(CLINIC, "9845012233");

    expect(family).toHaveLength(2);
    expect(family.map((p) => p.name).sort()).toEqual([
      "Aarav Prakash",
      "Diya Prakash",
    ]);
  });

  it("returns a single member for an unshared phone", async () => {
    expect(await getFamily(CLINIC, "9741556677")).toHaveLength(1);
  });

  it("returns nothing for an unknown phone", async () => {
    expect(await getFamily(CLINIC, "0000000000")).toEqual([]);
  });
});

describe("getPatient", () => {
  it("returns the patient with allergies intact", async () => {
    const patient = await getPatient(CLINIC, AARAV);

    expect(patient?.name).toBe("Aarav Prakash");
    expect(patient?.allergies).toContain("Amoxicillin — rash");
    expect(patient?.guardianName).toBe("Prakash M");
  });

  it("returns the DPDP consent date captured at registration", async () => {
    const patient = await getPatient(CLINIC, AARAV);
    expect(patient?.consentGivenAt).toBeTruthy();
  });

  it("returns null for an unknown id", async () => {
    expect(
      await getPatient(CLINIC, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("returns null when the id belongs to another clinic", async () => {
    /* Belt and braces over RLS: a leaked id must not resolve. */
    expect(await getPatient(OTHER_CLINIC, AARAV)).toBeNull();
  });
});

describe("getPatientTimeline", () => {
  it("returns the patient's visits", async () => {
    const timeline = await getPatientTimeline(CLINIC, AARAV);
    expect(timeline.length).toBeGreaterThan(0);
  });

  it("keeps a visit that has no consultation row", async () => {
    /* The seeded visits have no consultations yet. An inner join would return
       nothing here, which is the bug this asserts against. */
    const timeline = await getPatientTimeline(CLINIC, AARAV);
    expect(timeline.some((entry) => entry.diagnosis === null)).toBe(true);
  });

  it("attaches vitals where they were recorded", async () => {
    const timeline = await getPatientTimeline(CLINIC, AARAV);
    const withVitals = timeline.find((entry) => entry.vitals !== null);

    expect(withVitals?.vitals).toMatchObject({ tempC: 38.9 });
  });

  it("resolves the doctor's name", async () => {
    const timeline = await getPatientTimeline(CLINIC, AARAV);
    expect(timeline.every((entry) => entry.doctorName.length > 0)).toBe(true);
  });

  it("marks every visit unamended by default", async () => {
    const timeline = await getPatientTimeline(CLINIC, AARAV);
    expect(timeline.every((entry) => entry.amended === false)).toBe(true);
  });

  it("flips amended to true once a real correction is recorded", async () => {
    const before = await getPatientTimeline(CLINIC, AARAV);
    const target = before[0];

    await db.insert(recordRevisions).values({
      clinicId: CLINIC,
      entityTable: "consultations",
      entityId: target.visitId,
      previousValues: { diagnosis: "Something else" },
      reason: "Test amendment",
      editedByStaffId: null,
    });

    try {
      const after = await getPatientTimeline(CLINIC, AARAV);
      expect(after.find((e) => e.visitId === target.visitId)?.amended).toBe(
        true,
      );
      expect(
        after.filter((e) => e.visitId !== target.visitId).every((e) => !e.amended),
      ).toBe(true);
    } finally {
      await db
        .delete(recordRevisions)
        .where(eq(recordRevisions.entityId, target.visitId));
    }
  });

  it("is scoped to the clinic", async () => {
    expect(await getPatientTimeline(OTHER_CLINIC, AARAV)).toEqual([]);
  });
});
