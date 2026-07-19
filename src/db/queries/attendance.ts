import "server-only";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { attendance, staff } from "@/db/schema";

export type AttendanceToday = {
  staffId: string;
  checkInAt: Date;
  checkOutAt: Date | null;
};

export type MonthlyPresence = {
  staffId: string;
  daysPresent: number;
};

/**
 * Staff attendance (§7.8).
 *
 * Presence is derived from check-in rows rather than stored as a flag: a
 * boolean "present today" has to be reset by something at midnight, and
 * whatever does that reset is a job that will eventually not run. A row with
 * a timestamp is true forever about the day it describes.
 *
 * Counted in DAYS present, not hours worked. This is a small clinic wanting
 * to know who was in this month, not a payroll system — and pretending to
 * measure hours from two taps a day would give a number precise enough to be
 * trusted and wrong enough to be unfair.
 */
export async function getTodaysAttendance(
  clinicId: string,
  today: string,
  tx: Executor = db,
): Promise<AttendanceToday[]> {
  return tx
    .select({
      staffId: attendance.staffId,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.clinicId, clinicId),
        isNull(attendance.archivedAt),
        gte(attendance.checkInAt, new Date(`${today}T00:00:00+05:30`)),
        lte(attendance.checkInAt, new Date(`${today}T23:59:59.999+05:30`)),
      ),
    )
    .orderBy(desc(attendance.checkInAt));
}

/**
 * Distinct days each staff member checked in during the month.
 *
 * Distinct because a member who checks out for lunch and back in again has
 * two rows for one day, and counting rows would quietly reward that.
 */
export async function getMonthlyPresence(
  clinicId: string,
  monthStart: string,
  monthEnd: string,
  tx: Executor = db,
): Promise<MonthlyPresence[]> {
  const rows = await tx
    .select({
      staffId: attendance.staffId,
      checkInAt: attendance.checkInAt,
    })
    .from(attendance)
    .innerJoin(staff, eq(staff.id, attendance.staffId))
    .where(
      and(
        eq(attendance.clinicId, clinicId),
        isNull(attendance.archivedAt),
        gte(attendance.checkInAt, new Date(`${monthStart}T00:00:00+05:30`)),
        lte(attendance.checkInAt, new Date(`${monthEnd}T23:59:59.999+05:30`)),
      ),
    );

  /* Distinct (staff, local day) pairs. Done in JS against the clinic's
     timezone rather than date_trunc, which would truncate in the server's
     zone and miscount a 9pm check-in as the next day. */
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(row.checkInAt);

    if (!seen.has(row.staffId)) seen.set(row.staffId, new Set());
    seen.get(row.staffId)!.add(day);
  }

  return [...seen.entries()].map(([staffId, days]) => ({
    staffId,
    daysPresent: days.size,
  }));
}
