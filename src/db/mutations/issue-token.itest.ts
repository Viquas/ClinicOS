import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, patients, tokens, visits, waMessages } from "@/db/schema";
import { issueToken, registerPatient } from "./issue-token";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const STAFF = "22222222-0000-0000-0000-000000000004";
const DOCTOR = "33333333-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";
const AARAV_PHONE = "9845012233";

/* A date of its own so these never disturb the seeded queue. */
const TEST_DATE = "2026-09-09";

afterEach(async () => {
  const rows = await db
    .select({ id: tokens.id, visitId: tokens.visitId })
    .from(tokens)
    .where(and(eq(tokens.clinicId, CLINIC), eq(tokens.tokenDate, TEST_DATE)));

  if (rows.length > 0) {
    await db.delete(auditLog).where(
      inArray(
        auditLog.entityId,
        rows.map((r) => r.id),
      ),
    );
    await db.delete(tokens).where(eq(tokens.tokenDate, TEST_DATE));
    await db.delete(visits).where(eq(visits.visitDate, TEST_DATE));
  }

  /* issueToken also queues a token_confirmation WhatsApp message; clean up
     the ones this file's runs produce, scoped to the test patient's phone. */
  await db
    .delete(waMessages)
    .where(
      and(
        eq(waMessages.clinicId, CLINIC),
        eq(waMessages.toPhone, AARAV_PHONE),
        eq(waMessages.templateName, "token_confirmation"),
      ),
    );
});

const issue = (overrides: Partial<Parameters<typeof issueToken>[0]> = {}) =>
  issueToken({
    clinicId: CLINIC,
    patientId: AARAV,
    doctorId: DOCTOR,
    onDate: TEST_DATE,
    actorStaffId: STAFF,
    ...overrides,
  });

describe("issueToken", () => {
  it("starts at 1 on a fresh day", async () => {
    const result = await issue();
    expect(result).toMatchObject({ ok: true, number: 1 });
  });

  it("increments for each subsequent patient", async () => {
    await issue();
    await issue();
    const third = await issue();

    expect(third).toMatchObject({ ok: true, number: 3 });
  });

  it("creates a visit alongside the token", async () => {
    const result = await issue();
    if (!result.ok) throw new Error("expected success");

    const [visit] = await db
      .select({ id: visits.id, patientId: visits.patientId })
      .from(visits)
      .where(eq(visits.id, result.visitId));

    expect(visit.patientId).toBe(AARAV);
  });

  it("queues a token confirmation WhatsApp message (§7.10 P0)", async () => {
    const result = await issue();
    if (!result.ok) throw new Error("expected success");

    const [message] = await db
      .select({
        toPhone: waMessages.toPhone,
        templateName: waMessages.templateName,
        status: waMessages.status,
        payload: waMessages.payload,
      })
      .from(waMessages)
      .where(
        and(
          eq(waMessages.clinicId, CLINIC),
          eq(waMessages.toPhone, AARAV_PHONE),
          eq(waMessages.templateName, "token_confirmation"),
        ),
      );

    expect(message.status).toBe("queued");
    expect(message.payload).toMatchObject({
      patientName: "Aarav Prakash",
      tokenNumber: result.number,
    });
  });

  it("records the issue in the audit log", async () => {
    const result = await issue();
    if (!result.ok) throw new Error("expected success");

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, result.tokenId));

    expect(entry.action).toBe("token_issued");
    expect(entry.detail).toMatchObject({ number: 1 });
  });

  it("marks a priority insert", async () => {
    const result = await issue({ isPriority: true });
    if (!result.ok) throw new Error("expected success");

    const [row] = await db
      .select({ isPriority: tokens.isPriority })
      .from(tokens)
      .where(eq(tokens.id, result.tokenId));

    expect(row.isPriority).toBe(true);
  });

  it("refuses an unknown patient", async () => {
    const result = await issue({
      patientId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result).toEqual({ ok: false, error: "Patient not found" });
  });

  it("refuses a patient from another clinic", async () => {
    const result = await issue({ clinicId: OTHER_CLINIC });
    expect(result).toEqual({ ok: false, error: "Patient not found" });
  });
});

describe("concurrent issue — the race the unique index catches", () => {
  it("never hands two patients the same number", async () => {
    /*
     * Two front-desk tablets pressing "issue" at the same moment. Both read
     * the same maximum, both try to insert it, and the unique index on
     * (doctor_id, token_date, number) rejects the loser — which then retries
     * and takes the next number.
     *
     * Without the retry the second operator would see an error for work that
     * should simply have succeeded. Without the index they would both get the
     * same number and two patients would answer the same call.
     */
    const results = await Promise.all([issue(), issue(), issue(), issue()]);

    expect(results.every((r) => r.ok)).toBe(true);

    const numbers = results
      .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
      .map((r) => r.number)
      .sort((a, b) => a - b);

    expect(numbers).toEqual([1, 2, 3, 4]);
    expect(new Set(numbers).size).toBe(4);
  });

  it("leaves no duplicate numbers in the table", async () => {
    await Promise.all([issue(), issue(), issue()]);

    const rows = await db
      .select({ number: tokens.number })
      .from(tokens)
      .where(and(eq(tokens.clinicId, CLINIC), eq(tokens.tokenDate, TEST_DATE)));

    const numbers = rows.map((r) => r.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("registerPatient validation", () => {
  const base = {
    clinicId: CLINIC,
    name: "Test Patient",
    phone: "9000000123",
    sex: "male" as const,
    ageYears: 30,
    actorStaffId: STAFF,
  };

  const cleanup = async (id: string) => {
    await db.delete(auditLog).where(eq(auditLog.entityId, id));
    await db.delete(patients).where(eq(patients.id, id));
  };

  it("rejects a missing name", async () => {
    const result = await registerPatient({ ...base, name: " " });
    expect(result).toEqual({ ok: false, error: "Enter the patient's name" });
  });

  it("rejects a phone number that is not ten digits", async () => {
    expect(await registerPatient({ ...base, phone: "98450" })).toEqual({
      ok: false,
      error: "Enter a 10-digit phone number",
    });
  });

  it("accepts a phone number written with spaces or dashes", async () => {
    /* Front desk types what is on the referral slip. */
    const result = await registerPatient({ ...base, phone: "98450-12299" });
    expect(result.ok).toBe(true);

    if (result.ok) {
      const [row] = await db
        .select({ phone: patients.phone })
        .from(patients)
        .where(eq(patients.id, result.patientId));

      expect(row.phone).toBe("9845012299");
      await cleanup(result.patientId);
    }
  });

  it("requires either a date of birth or an age", async () => {
    const result = await registerPatient({
      ...base,
      ageYears: null,
      dateOfBirth: null,
    });

    expect(result).toEqual({
      ok: false,
      error: "Enter a date of birth or an age",
    });
  });

  it("stamps consent at registration (§9.1)", async () => {
    const result = await registerPatient(base);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const [row] = await db
        .select({ consentGivenAt: patients.consentGivenAt })
        .from(patients)
        .where(eq(patients.id, result.patientId));

      expect(row.consentGivenAt).not.toBeNull();
      await cleanup(result.patientId);
    }
  });

  it("allows a second family member on the same phone", async () => {
    /* Not a duplicate — the pediatric default (§7.1). */
    const first = await registerPatient({ ...base, name: "Sibling One" });
    const second = await registerPatient({ ...base, name: "Sibling Two" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (first.ok) await cleanup(first.patientId);
    if (second.ok) await cleanup(second.patientId);
  });
});
