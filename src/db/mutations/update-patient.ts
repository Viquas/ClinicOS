import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, patients, recordRevisions } from "@/db/schema";

export type PatientEdits = Partial<{
  name: string;
  phone: string;
  sex: "male" | "female" | "other";
  dateOfBirth: string | null;
  guardianName: string | null;
  allergies: string[];
  tags: string[];
}>;

export type UpdatePatientResult = { ok: true } | { ok: false; error: string };

/**
 * Corrects patient demographics (§9's editing model) — a typo'd phone number
 * or DOB must be fixable, but never silently: `reason` is mandatory, and the
 * pre-edit values for exactly the fields that changed are written to
 * record_revisions in the same transaction as the update, so the correction
 * and its justification can never come apart.
 *
 * Diffs against the CURRENT row rather than trusting the caller's idea of
 * what changed — a stale form re-submitting an unchanged field must not
 * manufacture a revision entry that says nothing was actually corrected.
 */
export async function updatePatientDemographics({
  clinicId,
  patientId,
  actorStaffId,
  reason,
  edits,
  executor = db,
}: {
  clinicId: string;
  patientId: string;
  actorStaffId: string | null;
  reason: string;
  edits: PatientEdits;
  /* Pass the tenant transaction to run under RLS. Nested inside one, the
     transaction below becomes a savepoint rather than a second connection —
     which is the point: a mutation opening its own connection would leave
     the caller's claims behind and silently regain owner privileges. */
  executor?: Executor;
}): Promise<UpdatePatientResult> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason is required to correct this record" };
  }

  return executor.transaction(async (tx) => {
    const [current] = await tx
      .select({
        name: patients.name,
        phone: patients.phone,
        sex: patients.sex,
        dateOfBirth: patients.dateOfBirth,
        guardianName: patients.guardianName,
        allergies: patients.allergies,
        tags: patients.tags,
      })
      .from(patients)
      .where(and(eq(patients.clinicId, clinicId), eq(patients.id, patientId)))
      .for("update");

    if (!current) {
      return { ok: false as const, error: "Patient not found" };
    }

    const changedFields: (keyof PatientEdits)[] = [];
    const previousValues: Record<string, unknown> = {};
    const nextValues: Record<string, unknown> = {};

    for (const key of Object.keys(edits) as (keyof PatientEdits)[]) {
      const incoming = edits[key];
      if (incoming === undefined) continue;

      const before = current[key as keyof typeof current];
      const changed = Array.isArray(incoming)
        ? JSON.stringify(incoming) !== JSON.stringify(before)
        : incoming !== before;

      if (changed) {
        changedFields.push(key);
        previousValues[key] = before;
        nextValues[key] = incoming;
      }
    }

    if (changedFields.length === 0) {
      return { ok: false as const, error: "No changes to save" };
    }

    await tx
      .update(patients)
      .set({ ...nextValues, updatedAt: new Date() })
      .where(eq(patients.id, patientId));

    await tx.insert(recordRevisions).values({
      clinicId,
      entityTable: "patients",
      entityId: patientId,
      previousValues,
      reason: trimmedReason,
      editedByStaffId: actorStaffId,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "patient_corrected",
      entityTable: "patients",
      entityId: patientId,
      detail: { fields: changedFields, reason: trimmedReason },
    });

    return { ok: true as const };
  });
}
