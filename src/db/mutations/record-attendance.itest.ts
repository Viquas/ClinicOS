import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance, auditLog } from "@/db/schema";
import { getMonthlyPresence, getTodaysAttendance } from "@/db/queries/attendance";
import { clinicDaysAgo, clinicMonthBounds, clinicToday } from "@/lib/clinic-date";
import { checkIn, checkOut } from "./record-attendance";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const SAMEERA = "22222222-0000-0000-0000-000000000001"; // owner
const LATHA = "22222222-0000-0000-0000-000000000003"; // nurse
const REKHA = "22222222-0000-0000-0000-000000000004"; // front desk

const TODAY = clinicToday();

const asSelf = (staffId: string) => ({
  clinicId: CLINIC,
  staffId,
  actorStaffId: staffId,
  actorIsOwner: false,
  today: TODAY,
});

afterEach(async () => {
  await db.delete(attendance).where(eq(attendance.clinicId, CLINIC));
  await db.delete(auditLog).where(eq(auditLog.entityTable, "attendance"));
});

describe("checkIn", () => {
  it("records a check-in for today", async () => {
    expect((await checkIn(asSelf(LATHA))).ok).toBe(true);

    const today = await getTodaysAttendance(CLINIC, TODAY);
    expect(today.map((a) => a.staffId)).toContain(LATHA);
    expect(today[0].checkOutAt).toBeNull();
  });

  it("refuses a second check-in while one is open", async () => {
    await checkIn(asSelf(LATHA));
    const again = await checkIn(asSelf(LATHA));

    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toContain("Already checked in");
  });

  it("survives a double tap without writing two rows", async () => {
    /* Two taps on a shared tablet a moment apart. The FOR UPDATE lock is
       what makes the second wait and then see the first. */
    await Promise.all([
      checkIn(asSelf(LATHA)).catch(() => null),
      checkIn(asSelf(LATHA)).catch(() => null),
    ]);

    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.staffId, LATHA));
    expect(rows).toHaveLength(1);
  });

  it("refuses checking in a colleague", async () => {
    const result = await checkIn({
      clinicId: CLINIC,
      staffId: LATHA,
      actorStaffId: REKHA,
      actorIsOwner: false,
      today: TODAY,
    });
    expect(result.ok).toBe(false);
  });

  it("lets the owner check someone in who forgot", async () => {
    const result = await checkIn({
      clinicId: CLINIC,
      staffId: LATHA,
      actorStaffId: SAMEERA,
      actorIsOwner: true,
      today: TODAY,
    });
    expect(result.ok).toBe(true);
  });

  it("allows a fresh check-in after checking out", async () => {
    await checkIn(asSelf(LATHA));
    await checkOut(asSelf(LATHA));
    expect((await checkIn(asSelf(LATHA))).ok).toBe(true);

    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.staffId, LATHA));
    expect(rows).toHaveLength(2);
  });
});

describe("checkOut", () => {
  it("closes the open row", async () => {
    await checkIn(asSelf(LATHA));
    expect((await checkOut(asSelf(LATHA))).ok).toBe(true);

    const [row] = await db
      .select()
      .from(attendance)
      .where(eq(attendance.staffId, LATHA));
    expect(row.checkOutAt).not.toBeNull();
  });

  it("refuses when nobody is checked in", async () => {
    const result = await checkOut(asSelf(LATHA));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Not checked in");
  });

  it("closes the LATER row when someone checked in twice", async () => {
    await checkIn(asSelf(LATHA));
    await checkOut(asSelf(LATHA));
    await checkIn(asSelf(LATHA));
    await checkOut(asSelf(LATHA));

    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.staffId, LATHA));
    expect(rows.every((r) => r.checkOutAt !== null)).toBe(true);
  });

  it("refuses a check-out before its own check-in", async () => {
    await checkIn(asSelf(LATHA));
    const result = await checkOut({
      ...asSelf(LATHA),
      at: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(result.ok).toBe(false);
  });
});

describe("monthly presence", () => {
  it("counts a day once even when someone checks in twice", async () => {
    /* Lunch break: out and back in is still one day present. Counting rows
       would say two. */
    await checkIn(asSelf(LATHA));
    await checkOut(asSelf(LATHA));
    await checkIn(asSelf(LATHA));

    const { start, end } = clinicMonthBounds();
    const presence = await getMonthlyPresence(CLINIC, start, end);
    const latha = presence.find((p) => p.staffId === LATHA);

    expect(latha?.daysPresent).toBe(1);
  });

  it("counts separate days separately", async () => {
    const yesterday = clinicDaysAgo(1);
    await checkIn(asSelf(LATHA));
    await checkIn({
      ...asSelf(LATHA),
      today: yesterday,
      at: new Date(`${yesterday}T09:00:00+05:30`),
    });

    const { start, end } = clinicMonthBounds();
    const presence = await getMonthlyPresence(CLINIC, start, end);
    const latha = presence.find((p) => p.staffId === LATHA);

    /* Only holds when yesterday is in the same month; on the 1st the
       earlier row falls outside the window and one day is correct. */
    expect(latha?.daysPresent).toBe(yesterday.slice(0, 7) === TODAY.slice(0, 7) ? 2 : 1);
  });

  it("is scoped to the clinic", async () => {
    await checkIn(asSelf(LATHA));
    const { start, end } = clinicMonthBounds();
    expect(
      await getMonthlyPresence("99999999-9999-9999-9999-999999999999", start, end),
    ).toEqual([]);
  });
});

describe("audit", () => {
  it("logs both directions against the actor", async () => {
    await checkIn(asSelf(LATHA));
    await checkOut(asSelf(LATHA));

    const entries = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityTable, "attendance"));

    expect(entries.map((e) => e.action).sort()).toEqual([
      "attendance_checked_in",
      "attendance_checked_out",
    ]);
  });
});
