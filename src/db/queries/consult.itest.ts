import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tokens, visits, vitals } from "@/db/schema";
import { getConsultContext } from "./consult";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DR_SAMEERA = "33333333-0000-0000-0000-000000000001";

let visitId: string;
let tokenId: string;

async function cleanup() {
  if (!visitId) return;
  await db.delete(vitals).where(eq(vitals.visitId, visitId));
  await db.delete(tokens).where(eq(tokens.visitId, visitId));
  await db.delete(visits).where(eq(visits.id, visitId));
}

beforeEach(async () => {
  await cleanup();
  const [visit] = await db
    .insert(visits)
    .values({
      clinicId: CLINIC,
      patientId: AARAV,
      doctorId: DR_SAMEERA,
      visitDate: clinicToday(),
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  const [token] = await db
    .insert(tokens)
    .values({
      clinicId: CLINIC,
      visitId,
      doctorId: DR_SAMEERA,
      tokenDate: clinicToday(),
      number: 91,
      state: "with_doctor",
    })
    .returning({ id: tokens.id });
  tokenId = token.id;

  await db.insert(vitals).values({
    clinicId: CLINIC,
    visitId,
    recordedByStaffId: null,
    values: { tempC: 37.5, weightKg: 14.0 },
  });
});

afterEach(cleanup);

describe("getConsultContext", () => {
  it("returns the patient, token, and treating doctor's specialty", async () => {
    const ctx = await getConsultContext(CLINIC, visitId);

    expect(ctx?.patient.name).toBe("Aarav Prakash");
    expect(ctx?.tokenId).toBe(tokenId);
    expect(ctx?.tokenState).toBe("with_doctor");
    expect(ctx?.doctor.specialty).toBe("pediatrics");
    expect(ctx?.doctor.name).toBe("Dr. Sameera Rahman");
  });

  it("carries the doctor's registration number for the prescribing gate", async () => {
    const ctx = await getConsultContext(CLINIC, visitId);
    expect(ctx?.doctor.registrationNo).toBe("KMC 78412");
  });

  it("returns the vitals the nurse already recorded for this visit", async () => {
    const ctx = await getConsultContext(CLINIC, visitId);
    expect(ctx?.vitals).toMatchObject({ tempC: 37.5, weightKg: 14.0 });
  });

  it("returns null vitals when none have been recorded", async () => {
    await db.delete(vitals).where(eq(vitals.visitId, visitId));
    const ctx = await getConsultContext(CLINIC, visitId);
    expect(ctx?.vitals).toBeNull();
  });

  it("returns null for a visit outside the clinic", async () => {
    expect(await getConsultContext(OTHER_CLINIC, visitId)).toBeNull();
  });

  it("returns null for a visit that does not exist", async () => {
    expect(
      await getConsultContext(CLINIC, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});
