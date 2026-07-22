import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  consultations,
  prescriptionItems,
  prescriptions,
  visits,
} from "@/db/schema";
import { clinicToday } from "@/lib/clinic-date";
import { getPrescriptionPrintData } from "./prescription-print";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DOCTOR = "33333333-0000-0000-0000-000000000001";

let visitId: string;
let rxId: string;

async function cleanup() {
  if (rxId) {
    await db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rxId));
    await db.delete(prescriptions).where(eq(prescriptions.id, rxId));
  }
  if (visitId) {
    await db.delete(consultations).where(eq(consultations.visitId, visitId));
    await db.delete(visits).where(eq(visits.id, visitId));
  }
}

beforeEach(async () => {
  const [visit] = await db
    .insert(visits)
    .values({ clinicId: CLINIC, patientId: AARAV, doctorId: DOCTOR, visitDate: clinicToday() })
    .returning({ id: visits.id });
  visitId = visit.id;

  await db.insert(consultations).values({
    clinicId: CLINIC,
    visitId,
    doctorId: DOCTOR,
    diagnosis: "URTI",
  });

  const [rx] = await db
    .insert(prescriptions)
    .values({
      clinicId: CLINIC,
      visitId,
      doctorId: DOCTOR,
      issuedSnapshot: { doctorId: DOCTOR },
      signedAt: new Date(),
    })
    .returning({ id: prescriptions.id });
  rxId = rx.id;

  await db.insert(prescriptionItems).values({
    clinicId: CLINIC,
    prescriptionId: rxId,
    drugName: "Paracetamol Syrup",
    dosage: "1-0-1",
    scheduleClass: "none",
  });
});

afterEach(cleanup);

describe("getPrescriptionPrintData", () => {
  it("returns the prescription id alongside the lines", async () => {
    const data = await getPrescriptionPrintData(CLINIC, visitId);
    expect(data).not.toBeNull();
    expect(data!.prescriptionId).toBe(rxId);
    expect(data!.lines).toHaveLength(1);
  });

  it("returns null prescriptionId for an advice-only visit", async () => {
    await db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rxId));
    await db.delete(prescriptions).where(eq(prescriptions.id, rxId));
    rxId = "";
    const data = await getPrescriptionPrintData(CLINIC, visitId);
    expect(data!.prescriptionId).toBeNull();
  });
});
