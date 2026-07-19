import "server-only";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { attendance, auditLog } from "@/db/schema";

export type AttendanceResult = { ok: true } | { ok: false; error: string };

/**
 * Staff check-in and check-out (§7.8).
 *
 * Anyone may record their OWN attendance; the owner may record anyone's,
 * because someone forgetting to tap in and asking the owner to fix it is the
 * ordinary case, not an exception. What nobody can do is check in on behalf
 * of a colleague who is not there — hence the owner-or-self rule rather than
 * a free-for-all.
 *
 * Both operations lock the day's open row before writing. Without it, two
 * taps on a shared tablet a second apart both see "no open check-in" and
 * write two rows, which then reads as two separate shifts.
 */

const IST = "+05:30";

function dayBounds(day: string): [Date, Date] {
  return [
    new Date(`${day}T00:00:00${IST}`),
    new Date(`${day}T23:59:59.999${IST}`),
  ];
}

export async function checkIn({
  clinicId,
  staffId,
  actorStaffId,
  actorIsOwner,
  today,
  at = new Date(),
  executor = db,
}: {
  clinicId: string;
  staffId: string;
  actorStaffId: string;
  actorIsOwner: boolean;
  today: string;
  at?: Date;
  executor?: Executor;
}): Promise<AttendanceResult> {
  if (!actorIsOwner && actorStaffId !== staffId) {
    return { ok: false, error: "You can only check yourself in" };
  }

  return executor.transaction(async (tx) => {
    const [start, end] = dayBounds(today);

    const [open] = await tx
      .select({ id: attendance.id })
      .from(attendance)
      .where(
        and(
          eq(attendance.clinicId, clinicId),
          eq(attendance.staffId, staffId),
          isNull(attendance.checkOutAt),
          isNull(attendance.archivedAt),
          gte(attendance.checkInAt, start),
          lte(attendance.checkInAt, end),
        ),
      )
      .for("update");

    if (open) {
      return { ok: false as const, error: "Already checked in" };
    }

    await tx.insert(attendance).values({ clinicId, staffId, checkInAt: at });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "attendance_checked_in",
      entityTable: "attendance",
      entityId: staffId,
    });

    return { ok: true as const };
  });
}

export async function checkOut({
  clinicId,
  staffId,
  actorStaffId,
  actorIsOwner,
  today,
  at = new Date(),
  executor = db,
}: {
  clinicId: string;
  staffId: string;
  actorStaffId: string;
  actorIsOwner: boolean;
  today: string;
  at?: Date;
  executor?: Executor;
}): Promise<AttendanceResult> {
  if (!actorIsOwner && actorStaffId !== staffId) {
    return { ok: false, error: "You can only check yourself out" };
  }

  return executor.transaction(async (tx) => {
    const [start, end] = dayBounds(today);

    /* Newest open row: a member who checked in, out, and in again during one
       day has two rows, and it is the later one that is still open. */
    const [open] = await tx
      .select({ id: attendance.id, checkInAt: attendance.checkInAt })
      .from(attendance)
      .where(
        and(
          eq(attendance.clinicId, clinicId),
          eq(attendance.staffId, staffId),
          isNull(attendance.checkOutAt),
          isNull(attendance.archivedAt),
          gte(attendance.checkInAt, start),
          lte(attendance.checkInAt, end),
        ),
      )
      .orderBy(desc(attendance.checkInAt))
      .for("update");

    if (!open) {
      return { ok: false as const, error: "Not checked in today" };
    }
    if (at < open.checkInAt) {
      /* Only reachable via a caller-supplied clock, but a checkout before its
         own check-in would produce a negative shift downstream. */
      return { ok: false as const, error: "Check-out cannot precede check-in" };
    }

    await tx
      .update(attendance)
      .set({ checkOutAt: at, updatedAt: new Date() })
      .where(eq(attendance.id, open.id));

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "attendance_checked_out",
      entityTable: "attendance",
      entityId: staffId,
    });

    return { ok: true as const };
  });
}
