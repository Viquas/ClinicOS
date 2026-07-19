import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, consultations, recordRevisions, visits } from "@/db/schema";
import { amendConsultation } from "./amend-consultation";

const CLINIC = "11111111-1111-1111-1111-111111111111";
/* Dr Sameera Rahman's own staff id — the treating doctor on the fixture
   consultation below, and the only non-owner allowed to amend it. */
const DR_SAMEERA_STAFF = "22222222-0000-0000-0000-000000000001";
const DR_SAMEERA_DOCTOR = "33333333-0000-0000-0000-000000000001";
/* Dr Anand Gowda's staff id — a different doctor, must be refused. */
const DR_ANAND_STAFF = "22222222-0000-0000-0000-000000000002";
const AARAV = "44444444-0000-0000-0000-000000000001";

let visitId: string;

async function cleanup() {
  if (!visitId) return;
  await db.delete(recordRevisions).where(eq(recordRevisions.entityId, visitId));
  await db.delete(auditLog).where(eq(auditLog.entityId, visitId));
  await db.delete(consultations).where(eq(consultations.visitId, visitId));
  await db.delete(visits).where(eq(visits.id, visitId));
}

beforeEach(async () => {
  await cleanup();
  const [visit] = await db
    .insert(visits)
    .values({
      clinicId: CLINIC,
      patientId: AARAV,
      doctorId: DR_SAMEERA_DOCTOR,
      visitDate: clinicToday(),
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  await db.insert(consultations).values({
    clinicId: CLINIC,
    visitId,
    doctorId: DR_SAMEERA_DOCTOR,
    diagnosis: "Acute viral fever",
    advice: null,
    followUpDate: null,
  });
});

afterEach(cleanup);

describe("amendConsultation", () => {
  it("lets the treating doctor amend their own diagnosis", async () => {
    const result = await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_SAMEERA_STAFF,
      actorRoles: ["doctor"],
      reason: "Dictation software mis-transcribed the diagnosis",
      edits: { diagnosis: "Wheeze-associated LRTI" },
    });
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ diagnosis: consultations.diagnosis })
      .from(consultations)
      .where(eq(consultations.visitId, visitId));
    expect(row.diagnosis).toBe("Wheeze-associated LRTI");
  });

  it("records the pre-amendment diagnosis as a revision", async () => {
    await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_SAMEERA_STAFF,
      actorRoles: ["doctor"],
      reason: "Correcting a typo in the diagnosis",
      edits: { diagnosis: "Otitis media" },
    });

    const [revision] = await db
      .select()
      .from(recordRevisions)
      .where(eq(recordRevisions.entityId, visitId));
    expect(revision.previousValues).toEqual({ diagnosis: "Acute viral fever" });
  });

  it("lets the owner amend a consultation they did not author", async () => {
    const result = await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_ANAND_STAFF,
      actorRoles: ["owner", "doctor"],
      reason: "Owner review found a transcription error",
      edits: { diagnosis: "Otitis media" },
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a different doctor with no owner role", async () => {
    const result = await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_ANAND_STAFF,
      actorRoles: ["doctor"],
      reason: "Trying to amend someone else's record",
      edits: { diagnosis: "Otitis media" },
    });
    expect(result.ok).toBe(false);

    const [row] = await db
      .select({ diagnosis: consultations.diagnosis })
      .from(consultations)
      .where(eq(consultations.visitId, visitId));
    expect(row.diagnosis).toBe("Acute viral fever");
  });

  it("refuses an edit with no reason", async () => {
    const result = await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_SAMEERA_STAFF,
      actorRoles: ["doctor"],
      reason: "",
      edits: { diagnosis: "Otitis media" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses when nothing actually changed", async () => {
    const result = await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_SAMEERA_STAFF,
      actorRoles: ["doctor"],
      reason: "No real change here",
      edits: { diagnosis: "Acute viral fever" },
    });
    expect(result.ok).toBe(false);
  });

  it("can amend advice and follow-up date together", async () => {
    const result = await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_SAMEERA_STAFF,
      actorRoles: ["doctor"],
      reason: "Doctor added advice after reviewing labs",
      edits: { advice: "Start ORS", followUpDate: "2026-07-25" },
    });
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ advice: consultations.advice, followUpDate: consultations.followUpDate })
      .from(consultations)
      .where(eq(consultations.visitId, visitId));
    expect(row.advice).toBe("Start ORS");
    expect(row.followUpDate).toBe("2026-07-25");
  });

  it("logs an audit entry naming the changed fields", async () => {
    await amendConsultation({
      clinicId: CLINIC,
      visitId,
      actorStaffId: DR_SAMEERA_STAFF,
      actorRoles: ["doctor"],
      reason: "Correcting the diagnosis",
      edits: { diagnosis: "Otitis media" },
    });

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, visitId));
    expect(entry.action).toBe("consultation_amended");
    expect(entry.detail).toMatchObject({ fields: ["diagnosis"] });
  });
});
