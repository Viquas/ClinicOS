import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  consultations,
  prescriptionItems,
  prescriptions,
  tokens,
  visits,
} from "@/db/schema";
import { recordConsultation } from "./record-consultation";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DR_SAMEERA = "33333333-0000-0000-0000-000000000001";
const AMOXICILLIN = "55555555-0000-0000-0000-000000000002";

let visitId: string;
let tokenId: string;

async function cleanup() {
  if (!visitId) return;
  const rxRows = await db
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(eq(prescriptions.visitId, visitId));

  for (const rx of rxRows) {
    await db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx.id));
  }
  await db.delete(auditLog).where(eq(auditLog.entityId, visitId));
  await db.delete(prescriptions).where(eq(prescriptions.visitId, visitId));
  await db.delete(consultations).where(eq(consultations.visitId, visitId));
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
      visitDate: "2026-07-18",
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  const [token] = await db
    .insert(tokens)
    .values({
      clinicId: CLINIC,
      visitId,
      doctorId: DR_SAMEERA,
      tokenDate: "2026-07-18",
      number: 92,
      state: "with_doctor",
    })
    .returning({ id: tokens.id });
  tokenId = token.id;
});

afterEach(cleanup);

const base = {
  clinicId: CLINIC,
  doctorId: DR_SAMEERA,
  actorStaffId: STAFF,
  advice: null,
  followUpDate: null,
  lines: [],
};

describe("recordConsultation", () => {
  it("writes the consultation and advances the token to at_pharmacy", async () => {
    const result = await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "Well-child visit",
    });
    expect(result.ok).toBe(true);

    const [token] = await db.select({ state: tokens.state }).from(tokens).where(eq(tokens.id, tokenId));
    expect(token.state).toBe("at_pharmacy");

    const [row] = await db
      .select({ diagnosis: consultations.diagnosis })
      .from(consultations)
      .where(eq(consultations.visitId, visitId));
    expect(row.diagnosis).toBe("Well-child visit");
  });

  it("refuses an empty diagnosis", async () => {
    const result = await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("completes with no prescription lines at all", async () => {
    const result = await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "Well-child visit",
      lines: [],
    });
    expect(result.ok).toBe(true);

    const rx = await db.select().from(prescriptions).where(eq(prescriptions.visitId, visitId));
    expect(rx).toEqual([]);
  });

  it("writes a prescription and its items when lines are given", async () => {
    const result = await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "Otitis media",
      lines: [
        {
          inventoryItemId: AMOXICILLIN,
          drugName: "Amoxicillin",
          strength: "125mg/5ml",
          dosage: "1-0-1",
          durationDays: 5,
          scheduleClass: "h",
          allergyOverrideReason: null,
        },
      ],
    });
    expect(result.ok).toBe(true);

    const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.visitId, visitId));
    expect(rx).toBeTruthy();

    const items = await db
      .select()
      .from(prescriptionItems)
      .where(eq(prescriptionItems.prescriptionId, rx.id));
    expect(items).toHaveLength(1);
    expect(items[0].drugName).toBe("Amoxicillin");
    expect(items[0].scheduleClass).toBe("h");
  });

  it("stores the allergy override reason on the line", async () => {
    await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "Otitis media",
      lines: [
        {
          inventoryItemId: AMOXICILLIN,
          drugName: "Amoxicillin",
          strength: null,
          dosage: "1-0-1",
          durationDays: 5,
          scheduleClass: "h",
          allergyOverrideReason: "Prior reaction was mild, no alternative in stock",
        },
      ],
    });

    const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.visitId, visitId));
    const [item] = await db
      .select()
      .from(prescriptionItems)
      .where(eq(prescriptionItems.prescriptionId, rx.id));
    expect(item.allergyOverrideReason).toBe(
      "Prior reaction was mild, no alternative in stock",
    );
  });

  it("refuses a token that is not with the doctor", async () => {
    await db.update(tokens).set({ state: "vitals_done" }).where(eq(tokens.id, tokenId));

    const result = await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "Well-child visit",
    });
    expect(result.ok).toBe(false);

    const rows = await db.select().from(consultations).where(eq(consultations.visitId, visitId));
    expect(rows).toEqual([]);
  });

  it("logs an audit entry with the prescription line count", async () => {
    await recordConsultation({
      ...base,
      visitId,
      tokenId,
      diagnosis: "Well-child visit",
      lines: [
        {
          inventoryItemId: AMOXICILLIN,
          drugName: "Amoxicillin",
          strength: null,
          dosage: "1-0-1",
          durationDays: 5,
          scheduleClass: "h",
          allergyOverrideReason: null,
        },
      ],
    });

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, visitId));
    expect(entry.action).toBe("consultation_completed");
    expect(entry.detail).toMatchObject({ prescriptionLineCount: 1 });
  });
});
