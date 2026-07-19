import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tokens, visits, vitals } from "@/db/schema";
import { getVitalsCaptureContext } from "./vitals-capture";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
/* Aarav Prakash, under Dr Sameera Rahman (pediatrics). */
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
      number: 77,
      state: "waiting",
    })
    .returning({ id: tokens.id });
  tokenId = token.id;
});

afterEach(cleanup);

describe("getVitalsCaptureContext", () => {
  it("returns the patient, token, and doctor's specialty", async () => {
    const ctx = await getVitalsCaptureContext(CLINIC, visitId);

    expect(ctx?.patient.name).toBe("Aarav Prakash");
    expect(ctx?.tokenId).toBe(tokenId);
    expect(ctx?.tokenState).toBe("waiting");
    expect(ctx?.doctorSpecialty).toBe("pediatrics");
  });

  it("carries the patient's allergies through", async () => {
    const ctx = await getVitalsCaptureContext(CLINIC, visitId);
    expect(ctx?.patient.allergies.some((a) => a.includes("Amoxicillin"))).toBe(
      true,
    );
  });

  it("finds the most recently created prior visit's vitals, excluding this visit", async () => {
    const ctx = await getVitalsCaptureContext(CLINIC, visitId);
    /* Aarav's seeded "today" visit (createdAt earlier than this test's fresh
       insert, but the same calendar date) is the most recent prior visit at
       14.2 kg — createdAt is what breaks the same-day tie. */
    expect(ctx?.priorValues.weightKg).toBe(14.2);
  });

  it("returns null for a visit outside the clinic", async () => {
    expect(await getVitalsCaptureContext(OTHER_CLINIC, visitId)).toBeNull();
  });

  it("returns null for a visit that does not exist", async () => {
    expect(
      await getVitalsCaptureContext(
        CLINIC,
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });
});
