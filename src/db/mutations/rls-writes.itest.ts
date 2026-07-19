import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clinics, patients } from "@/db/schema";
import { withClaims } from "@/db/with-claims";
import { updatePatientDemographics } from "./update-patient";

/**
 * Does the write path survive running under RLS, and does RLS actually
 * constrain it? — prd-real-auth.md Phase A.
 *
 * Two separate questions, and both matter before converting mutations:
 *
 *  1. Mechanically, every mutation opens its own db.transaction(). Inside a
 *     tenant transaction that becomes a SAVEPOINT rather than a second
 *     connection. If Drizzle handles that badly, converting writes breaks
 *     every mutation in the app at once.
 *  2. The audit of update-by-id call sites came back clean — each is guarded
 *     by a clinic-scoped SELECT ... FOR UPDATE in the same transaction. So
 *     RLS is defence in depth here, not the primary guard. Worth proving it
 *     holds anyway, because the next mutation someone writes may forget the
 *     guard.
 */

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "88888888-0000-0000-0000-000000000005";
const OWNER_A = "22222222-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";

const claimsA = { clinicId: CLINIC_A, staffId: OWNER_A, staffRoles: ["owner"] };

let rivalPatientId: string;

beforeAll(async () => {
  await db
    .insert(clinics)
    .values({ id: CLINIC_B, name: "Write-Test Rival" })
    .onConflictDoNothing();

  const [row] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC_B,
      name: "Rival Patient",
      phone: "9000000002",
      sex: "female",
    })
    .returning({ id: patients.id });
  rivalPatientId = row.id;
});

afterAll(async () => {
  await db.delete(patients).where(eq(patients.clinicId, CLINIC_B));
  await db.delete(clinics).where(eq(clinics.id, CLINIC_B));
  /* Undo whatever the successful edit below changed. */
  await db
    .update(patients)
    .set({ guardianName: "Prakash M" })
    .where(eq(patients.id, AARAV));
});

describe("mutations inside a tenant transaction", () => {
  it("still work when nested as a savepoint", async () => {
    const result = await withClaims(claimsA, (tx) =>
      updatePatientDemographics({
        clinicId: CLINIC_A,
        patientId: AARAV,
        actorStaffId: OWNER_A,
        reason: "Guardian's name corrected from the ID card",
        edits: { guardianName: "Prakash Murthy" },
        executor: tx,
      }),
    );

    expect(result.ok).toBe(true);

    const [after] = await db
      .select({ guardian: patients.guardianName })
      .from(patients)
      .where(eq(patients.id, AARAV));
    expect(after.guardian).toBe("Prakash Murthy");
  });

  it("cannot reach another clinic's patient", async () => {
    const result = await withClaims(claimsA, (tx) =>
      updatePatientDemographics({
        /* A caller passing the RIGHT clinic id but the WRONG patient — the
           shape a bug takes in practice, rather than a forged clinic id. */
        clinicId: CLINIC_A,
        patientId: rivalPatientId,
        actorStaffId: OWNER_A,
        reason: "Attempting to edit across the tenant boundary",
        edits: { guardianName: "Should Never Apply" },
        executor: tx,
      }),
    );

    expect(result.ok).toBe(false);

    const [after] = await db
      .select({ guardian: patients.guardianName })
      .from(patients)
      .where(eq(patients.id, rivalPatientId));
    expect(after.guardian).not.toBe("Should Never Apply");
  });

  it("cannot reach it even when the claims name that other clinic", async () => {
    /* Claims and argument agreeing on clinic B, while the app-level guard
       would have passed. This is the case RLS alone has to stop. */
    const result = await withClaims(
      { clinicId: CLINIC_A, staffId: OWNER_A, staffRoles: ["owner"] },
      (tx) =>
        updatePatientDemographics({
          clinicId: CLINIC_B,
          patientId: rivalPatientId,
          actorStaffId: OWNER_A,
          reason: "Claims say A, argument says B",
          edits: { guardianName: "Should Never Apply" },
          executor: tx,
        }),
    );

    expect(result.ok).toBe(false);

    const [after] = await db
      .select({ guardian: patients.guardianName })
      .from(patients)
      .where(eq(patients.id, rivalPatientId));
    expect(after.guardian).not.toBe("Should Never Apply");
  });
});
