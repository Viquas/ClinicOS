import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, tokens, visits, vitals } from "@/db/schema";
import { recordVitals } from "./record-vitals";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000003";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DR_SAMEERA = "33333333-0000-0000-0000-000000000001";

let visitId: string;
let tokenId: string;

async function cleanup() {
  if (!visitId) return;
  await db.delete(auditLog).where(eq(auditLog.entityId, visitId));
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
      number: 78,
      state: "waiting",
    })
    .returning({ id: tokens.id });
  tokenId = token.id;
});

afterEach(cleanup);

describe("recordVitals", () => {
  it("writes a vitals row and advances the token to vitals_done", async () => {
    const result = await recordVitals({
      clinicId: CLINIC,
      visitId,
      tokenId,
      actorStaffId: STAFF,
      values: { tempC: 37.2, weightKg: 14.0 },
      skipped: [],
    });
    expect(result.ok).toBe(true);

    const [token] = await db
      .select({ state: tokens.state })
      .from(tokens)
      .where(eq(tokens.id, tokenId));
    expect(token.state).toBe("vitals_done");

    const [row] = await db
      .select({ values: vitals.values })
      .from(vitals)
      .where(eq(vitals.visitId, visitId));
    expect(row.values).toEqual({ tempC: 37.2, weightKg: 14.0 });
  });

  it("records skipped fields alongside recorded ones", async () => {
    await recordVitals({
      clinicId: CLINIC,
      visitId,
      tokenId,
      actorStaffId: STAFF,
      values: { tempC: 37.2 },
      skipped: ["weightKg"],
    });

    const [row] = await db
      .select({ skipped: vitals.skipped })
      .from(vitals)
      .where(eq(vitals.visitId, visitId));
    expect(row.skipped).toEqual(["weightKg"]);
  });

  it("refuses a token that is not waiting", async () => {
    await db
      .update(tokens)
      .set({ state: "with_doctor" })
      .where(eq(tokens.id, tokenId));

    const result = await recordVitals({
      clinicId: CLINIC,
      visitId,
      tokenId,
      actorStaffId: STAFF,
      values: { tempC: 37.2 },
      skipped: [],
    });
    expect(result.ok).toBe(false);

    const rows = await db.select().from(vitals).where(eq(vitals.visitId, visitId));
    expect(rows).toEqual([]);
  });

  it("refuses when nothing is recorded or skipped", async () => {
    const result = await recordVitals({
      clinicId: CLINIC,
      visitId,
      tokenId,
      actorStaffId: STAFF,
      values: {},
      skipped: [],
    });
    expect(result.ok).toBe(false);
  });

  it("logs an audit entry", async () => {
    await recordVitals({
      clinicId: CLINIC,
      visitId,
      tokenId,
      actorStaffId: STAFF,
      values: { tempC: 37.2 },
      skipped: [],
    });

    const [entry] = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, visitId));
    expect(entry.action).toBe("vitals_recorded");
  });
});
