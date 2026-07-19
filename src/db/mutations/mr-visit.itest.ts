import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, mrCompanies, medicalReps, mrVisits } from "@/db/schema";
import { checkInRep, logWalkInRep, markRepSeen } from "./mr-visit";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000004";
const DOCTOR = "33333333-0000-0000-0000-000000000001";

let companyId: string;
let repId: string;
let visitId: string;

async function cleanup() {
  if (visitId) {
    await db.delete(auditLog).where(eq(auditLog.entityId, visitId));
    await db.delete(mrVisits).where(eq(mrVisits.id, visitId));
  }
  if (repId) await db.delete(medicalReps).where(eq(medicalReps.id, repId));
  if (companyId) await db.delete(mrCompanies).where(eq(mrCompanies.id, companyId));
}

beforeEach(async () => {
  const [company] = await db
    .insert(mrCompanies)
    .values({ clinicId: CLINIC, name: "Test Pharma" })
    .returning({ id: mrCompanies.id });
  companyId = company.id;

  const [rep] = await db
    .insert(medicalReps)
    .values({ clinicId: CLINIC, companyId, name: "Test Rep", division: "Test" })
    .returning({ id: medicalReps.id });
  repId = rep.id;

  const [visit] = await db
    .insert(mrVisits)
    .values({ clinicId: CLINIC, repId, doctorId: DOCTOR })
    .returning({ id: mrVisits.id });
  visitId = visit.id;
});

afterEach(cleanup);

describe("checkInRep", () => {
  it("stamps checkedInAt on a booked visit", async () => {
    const result = await checkInRep({ clinicId: CLINIC, mrVisitId: visitId });
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ checkedInAt: mrVisits.checkedInAt })
      .from(mrVisits)
      .where(eq(mrVisits.id, visitId));
    expect(row.checkedInAt).not.toBeNull();
  });

  it("refuses to check in a visit that is already checked in", async () => {
    await checkInRep({ clinicId: CLINIC, mrVisitId: visitId });
    const second = await checkInRep({ clinicId: CLINIC, mrVisitId: visitId });

    expect(second.ok).toBe(false);
  });

  it("does not double-check-in under a concurrent double-tap", async () => {
    /* The atomic UPDATE...WHERE checkedInAt IS NULL makes this safe without a
       separate row lock — the second call's WHERE clause re-evaluates against
       the first call's committed write. */
    const [a, b] = await Promise.all([
      checkInRep({ clinicId: CLINIC, mrVisitId: visitId }),
      checkInRep({ clinicId: CLINIC, mrVisitId: visitId }),
    ]);

    const succeeded = [a, b].filter((r) => r.ok).length;
    expect(succeeded).toBe(1);
  });

  it("refuses an unknown visit", async () => {
    const result = await checkInRep({
      clinicId: CLINIC,
      mrVisitId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.ok).toBe(false);
  });
});

describe("markRepSeen", () => {
  it("stamps seenAt and backfills checkedInAt if the rep was seen ad hoc", async () => {
    const result = await markRepSeen({
      clinicId: CLINIC,
      mrVisitId: visitId,
      actorStaffId: STAFF,
    });
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ seenAt: mrVisits.seenAt, checkedInAt: mrVisits.checkedInAt })
      .from(mrVisits)
      .where(eq(mrVisits.id, visitId));

    expect(row.seenAt).not.toBeNull();
    expect(row.checkedInAt).not.toBeNull();
  });

  it("preserves the original checkedInAt when the rep was already waiting", async () => {
    await checkInRep({ clinicId: CLINIC, mrVisitId: visitId });
    const [before] = await db
      .select({ checkedInAt: mrVisits.checkedInAt })
      .from(mrVisits)
      .where(eq(mrVisits.id, visitId));

    await markRepSeen({ clinicId: CLINIC, mrVisitId: visitId, actorStaffId: STAFF });
    const [after] = await db
      .select({ checkedInAt: mrVisits.checkedInAt })
      .from(mrVisits)
      .where(eq(mrVisits.id, visitId));

    expect(after.checkedInAt).toEqual(before.checkedInAt);
  });

  it("records the doctor's private note", async () => {
    await markRepSeen({
      clinicId: CLINIC,
      mrVisitId: visitId,
      actorStaffId: STAFF,
      doctorNotes: "Asked about the new combination inhaler",
    });

    const [row] = await db
      .select({ notes: mrVisits.doctorNotes })
      .from(mrVisits)
      .where(eq(mrVisits.id, visitId));

    expect(row.notes).toBe("Asked about the new combination inhaler");
  });

  it("refuses to mark an already-seen visit seen again", async () => {
    await markRepSeen({ clinicId: CLINIC, mrVisitId: visitId, actorStaffId: STAFF });
    const second = await markRepSeen({
      clinicId: CLINIC,
      mrVisitId: visitId,
      actorStaffId: STAFF,
    });

    expect(second).toEqual({ ok: false, error: "Already marked seen" });
  });

  it("logs the completion", async () => {
    await markRepSeen({ clinicId: CLINIC, mrVisitId: visitId, actorStaffId: STAFF });

    const [entry] = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, visitId));

    expect(entry.action).toBe("mr_visit_completed");
  });
});

describe("logWalkInRep", () => {
  it("creates a visit that is immediately checked in", async () => {
    const result = await logWalkInRep({
      clinicId: CLINIC,
      repId,
      doctorId: DOCTOR,
      actorStaffId: STAFF,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db
      .select({ checkedInAt: mrVisits.checkedInAt, scheduledFor: mrVisits.scheduledFor })
      .from(mrVisits)
      .where(eq(mrVisits.id, result.mrVisitId));

    expect(row.checkedInAt).not.toBeNull();
    expect(row.scheduledFor).toBeNull();

    await db.delete(auditLog).where(eq(auditLog.entityId, result.mrVisitId));
    await db.delete(mrVisits).where(eq(mrVisits.id, result.mrVisitId));
  });

  it("logs the walk-in", async () => {
    const result = await logWalkInRep({
      clinicId: CLINIC,
      repId,
      doctorId: DOCTOR,
      actorStaffId: STAFF,
    });
    if (!result.ok) throw new Error("expected success");

    const [entry] = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, result.mrVisitId));

    expect(entry.action).toBe("mr_walkin_logged");

    await db.delete(auditLog).where(eq(auditLog.entityId, result.mrVisitId));
    await db.delete(mrVisits).where(eq(mrVisits.id, result.mrVisitId));
  });
});
