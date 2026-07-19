import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, doctors, staff } from "@/db/schema";
import type { StaffRole } from "@/lib/auth/claims";

/**
 * Staff and audit reads (§7.8).
 *
 * The audit log is the append-only record every dispense, discount, override,
 * merge and edit lands in. It is read newest-first because that is the
 * question an owner or inspector actually asks: what just happened.
 */

export type StaffRow = {
  id: string;
  name: string;
  phone: string;
  qualification: string | null;
  roles: string[];
  isActive: boolean;
  /* Present and registration number for doctors, so the "cannot prescribe"
     state (§9.2) is visible in the directory. */
  registrationNo: string | null;
  registrationCouncil: string | null;
  specialty: string | null;
  isDoctor: boolean;
};

export async function getStaff(clinicId: string): Promise<StaffRow[]> {
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      phone: staff.phone,
      qualification: staff.qualification,
      roles: staff.roles,
      isActive: staff.isActive,
      registrationNo: doctors.registrationNo,
      registrationCouncil: doctors.registrationCouncil,
      specialty: doctors.specialty,
    })
    .from(staff)
    /* Left join: most staff are not doctors, and must still be listed. */
    .leftJoin(doctors, eq(doctors.staffId, staff.id))
    .where(and(eq(staff.clinicId, clinicId), isNull(staff.archivedAt)))
    .orderBy(staff.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    qualification: r.qualification,
    roles: r.roles ?? [],
    isActive: r.isActive,
    registrationNo: r.registrationNo,
    registrationCouncil: r.registrationCouncil,
    specialty: r.specialty,
    isDoctor: (r.roles ?? []).includes("doctor"),
  }));
}

export type StaffIdentity = {
  id: string;
  name: string;
  roles: StaffRole[];
  /* Set only when "doctor" is among roles — the doctors.id (not staff.id),
     since that is the FK every clinical table actually joins on. */
  doctorId: string | null;
  specialty: string | null;
};

/**
 * Resolves one staff member's identity for the role switcher (§7.8, §7.12).
 *
 * Deliberately takes a staffId rather than reading a cookie itself — cookies
 * only exist inside a request, and this needs to be callable from a plain
 * integration test. The cookie read lives one layer up, in
 * src/lib/auth/current-staff.ts.
 */
export async function resolveStaffIdentity(
  clinicId: string,
  staffId: string,
): Promise<StaffIdentity | null> {
  const [row] = await db
    .select({
      id: staff.id,
      name: staff.name,
      roles: staff.roles,
      isActive: staff.isActive,
      doctorId: doctors.id,
      specialty: doctors.specialty,
    })
    .from(staff)
    .leftJoin(doctors, eq(doctors.staffId, staff.id))
    .where(
      and(
        eq(staff.clinicId, clinicId),
        eq(staff.id, staffId),
        isNull(staff.archivedAt),
      ),
    );

  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    name: row.name,
    roles: row.roles ?? [],
    doctorId: row.doctorId,
    specialty: row.specialty,
  };
}

/**
 * Who a device should act as when its cookie identity stops resolving —
 * stale after a reseed, or the staff member was deactivated mid-session.
 *
 * Prefers an active owner (the person who can fix whatever went wrong),
 * falling back to any active staff. Returns null only for a clinic with no
 * active staff at all, which is not a recoverable UI state anyway. This
 * replaced a hardcoded default staff id that would have crashed every
 * device in the clinic the day that one person was deactivated.
 */
export async function resolveFallbackStaff(
  clinicId: string,
): Promise<StaffIdentity | null> {
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      roles: staff.roles,
      createdAt: staff.createdAt,
      doctorId: doctors.id,
      specialty: doctors.specialty,
    })
    .from(staff)
    .leftJoin(doctors, eq(doctors.staffId, staff.id))
    .where(
      and(
        eq(staff.clinicId, clinicId),
        eq(staff.isActive, true),
        isNull(staff.archivedAt),
      ),
    )
    .orderBy(staff.createdAt);

  const pick = rows.find((r) => (r.roles ?? []).includes("owner")) ?? rows[0];
  if (!pick) return null;

  return {
    id: pick.id,
    name: pick.name,
    roles: pick.roles ?? [],
    doctorId: pick.doctorId,
    specialty: pick.specialty,
  };
}

export type AuditRow = {
  id: string;
  at: Date;
  actorName: string | null;
  action: string;
  detail: unknown;
};

export async function getAuditLog(
  clinicId: string,
  limit = 50,
): Promise<AuditRow[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      actorName: staff.name,
      action: auditLog.action,
      detail: auditLog.detail,
    })
    .from(auditLog)
    .leftJoin(staff, eq(staff.id, auditLog.actorStaffId))
    .where(eq(auditLog.clinicId, clinicId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows;
}
