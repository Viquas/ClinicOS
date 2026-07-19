import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { consultations, patients, visits } from "@/db/schema";

/**
 * Follow-ups a specific doctor set for today (§7.8 role homes).
 *
 * Scoped to doctorId, not staffId — a follow-up is a clinical commitment the
 * treating doctor made, and belongs on that doctor's home screen even in a
 * multi-doctor clinic where other staff share the login device.
 */
export type FollowUpRow = {
  patientId: string;
  patientName: string;
  diagnosis: string | null;
};

export async function getDoctorFollowUpsToday(
  clinicId: string,
  doctorId: string,
  onDate: string,
  tx: Executor = db,
): Promise<FollowUpRow[]> {
  const rows = await tx
    .select({
      patientId: patients.id,
      patientName: patients.name,
      diagnosis: consultations.diagnosis,
    })
    .from(consultations)
    .innerJoin(visits, eq(visits.id, consultations.visitId))
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .where(
      and(
        eq(consultations.clinicId, clinicId),
        eq(consultations.doctorId, doctorId),
        eq(consultations.followUpDate, onDate),
        isNull(visits.archivedAt),
      ),
    )
    .orderBy(patients.name);

  return rows;
}
