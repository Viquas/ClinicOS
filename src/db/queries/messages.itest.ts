import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, tokens, visits, waMessages } from "@/db/schema";
import { getMessages } from "./messages";
import { issueToken } from "@/db/mutations/issue-token";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const STAFF = "22222222-0000-0000-0000-000000000004";
const DOCTOR = "33333333-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";
const AARAV_PHONE = "9845012233";
const TEST_DATE = "2026-09-10";

afterEach(async () => {
  const rows = await db
    .select({ id: tokens.id })
    .from(tokens)
    .where(and(eq(tokens.clinicId, CLINIC), eq(tokens.tokenDate, TEST_DATE)));

  if (rows.length > 0) {
    await db.delete(auditLog).where(
      eq(auditLog.entityTable, "tokens"),
    );
    await db.delete(tokens).where(eq(tokens.tokenDate, TEST_DATE));
    await db.delete(visits).where(eq(visits.visitDate, TEST_DATE));
  }
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

describe("getMessages", () => {
  it("returns a real message written by issuing a token", async () => {
    const result = await issueToken({
      clinicId: CLINIC,
      patientId: AARAV,
      doctorId: DOCTOR,
      onDate: TEST_DATE,
      actorStaffId: STAFF,
    });
    expect(result.ok).toBe(true);

    const messages = await getMessages(CLINIC);
    const found = messages.find(
      (m) =>
        m.toPhone === AARAV_PHONE && m.templateName === "token_confirmation",
    );

    expect(found).toBeDefined();
    expect(found!.status).toBe("queued");
  });

  it("returns newest first", async () => {
    const messages = await getMessages(CLINIC);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
        messages[i].createdAt.getTime(),
      );
    }
  });

  it("is scoped to the clinic", async () => {
    expect(await getMessages(OTHER_CLINIC)).toEqual([]);
  });

  it("respects the limit", async () => {
    const messages = await getMessages(CLINIC, 1);
    expect(messages.length).toBeLessThanOrEqual(1);
  });
});
