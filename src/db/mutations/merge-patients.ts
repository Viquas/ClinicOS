import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, patients, visits } from "@/db/schema";

/**
 * Duplicate merge (§7.1). Kept out of the server action so it can be tested
 * against a real database — the action is a thin wrapper that adds
 * revalidation, which needs a request context this does not.
 *
 * Three properties, ordered by how badly they hurt if broken:
 *
 *  1. The losing record is NEVER deleted. §9.6 requires retention, so it is
 *     marked with mergedIntoId and archived. Search excludes it; the row lives.
 *  2. Visits move to the survivor, so the timeline is whole. A merge that
 *     strands history is worse than no merge — the doctor ends up with two
 *     partial records and trusts neither.
 *  3. One transaction, and logged. A half-applied merge would leave visits
 *     pointing at an archived patient.
 */

export type MergeResult =
  | { ok: true; movedVisits: number }
  | { ok: false; error: string };

export async function mergePatientRecords({
  clinicId,
  actorStaffId,
  survivorId,
  duplicateId,
}: {
  clinicId: string;
  actorStaffId: string | null;
  survivorId: string;
  duplicateId: string;
}): Promise<MergeResult> {
  if (survivorId === duplicateId) {
    return { ok: false, error: "Cannot merge a record into itself" };
  }

  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: patients.id,
          name: patients.name,
          mergedIntoId: patients.mergedIntoId,
        })
        .from(patients)
        .where(eq(patients.clinicId, clinicId));

      const survivor = rows.find((r) => r.id === survivorId);
      const duplicate = rows.find((r) => r.id === duplicateId);

      /* Also covers the cross-tenant case: an id from another clinic is
         simply absent from this result set. */
      if (!survivor || !duplicate) {
        return { ok: false as const, error: "Patient not found" };
      }

      if (duplicate.mergedIntoId) {
        /* Already merged — a double submit, or two tablets racing. Reporting
           success would imply work happened; reporting a hard error would
           confuse the operator, who can see the state is already correct. */
        return { ok: false as const, error: "That record was already merged" };
      }

      if (survivor.mergedIntoId) {
        return {
          ok: false as const,
          error: "Cannot merge into a record that was itself merged away",
        };
      }

      const moved = await tx
        .update(visits)
        .set({ patientId: survivorId, updatedAt: new Date() })
        .where(
          and(eq(visits.clinicId, clinicId), eq(visits.patientId, duplicateId)),
        )
        .returning({ id: visits.id });

      await tx
        .update(patients)
        .set({
          mergedIntoId: survivorId,
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(eq(patients.clinicId, clinicId), eq(patients.id, duplicateId)),
        );

      await tx.insert(auditLog).values({
        clinicId,
        actorStaffId,
        action: "patient_merged",
        entityTable: "patients",
        entityId: survivorId,
        detail: {
          survivorName: survivor.name,
          duplicateName: duplicate.name,
          duplicateId,
          movedVisits: moved.length,
        },
      });

      return { ok: true as const, movedVisits: moved.length };
    });
  } catch (error) {
    console.error("mergePatientRecords failed", error);
    return { ok: false, error: "Merge failed — nothing was changed" };
  }
}
