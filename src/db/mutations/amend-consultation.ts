import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, consultations, doctors, recordRevisions } from "@/db/schema";
import type { StaffRole } from "@/lib/auth/claims";

export type ConsultationEdits = Partial<{
  diagnosis: string | null;
  advice: string | null;
  followUpDate: string | null;
}>;

export type AmendConsultationResult = { ok: true } | { ok: false; error: string };

/**
 * Amends a past consultation (§9's editing model) — the authoring doctor, or
 * the owner, may correct a dictation error after the fact. Anyone else
 * (front desk, a different doctor, pharmacy) is refused here even before
 * RLS would deny the underlying write, because "not your patient record" is
 * a clearer error than a generic database failure.
 *
 * Same shape as updatePatientDemographics: mandatory reason, a diff against
 * the current row (not the caller's assumption of it), one revision row and
 * one audit row in the same transaction as the update.
 */
export async function amendConsultation({
  clinicId,
  visitId,
  actorStaffId,
  actorRoles,
  reason,
  edits,
}: {
  clinicId: string;
  visitId: string;
  actorStaffId: string;
  actorRoles: StaffRole[];
  reason: string;
  edits: ConsultationEdits;
}): Promise<AmendConsultationResult> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason is required to amend this record" };
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        diagnosis: consultations.diagnosis,
        advice: consultations.advice,
        followUpDate: consultations.followUpDate,
        doctorId: consultations.doctorId,
        authoringStaffId: doctors.staffId,
      })
      .from(consultations)
      .innerJoin(doctors, eq(doctors.id, consultations.doctorId))
      .where(
        and(eq(consultations.clinicId, clinicId), eq(consultations.visitId, visitId)),
      )
      .for("update");

    if (!current) {
      return { ok: false as const, error: "Consultation not found" };
    }

    const isOwner = actorRoles.includes("owner");
    const isAuthor = current.authoringStaffId === actorStaffId;
    if (!isOwner && !isAuthor) {
      return {
        ok: false as const,
        error: "Only the treating doctor or the owner can amend this record",
      };
    }

    const changedFields: (keyof ConsultationEdits)[] = [];
    const previousValues: Record<string, unknown> = {};
    const nextValues: Record<string, unknown> = {};

    for (const key of Object.keys(edits) as (keyof ConsultationEdits)[]) {
      const incoming = edits[key];
      if (incoming === undefined) continue;

      const before = current[key as keyof typeof current];
      if (incoming !== before) {
        changedFields.push(key);
        previousValues[key] = before;
        nextValues[key] = incoming;
      }
    }

    if (changedFields.length === 0) {
      return { ok: false as const, error: "No changes to save" };
    }

    await tx
      .update(consultations)
      .set({ ...nextValues, updatedAt: new Date() })
      .where(eq(consultations.visitId, visitId));

    await tx.insert(recordRevisions).values({
      clinicId,
      entityTable: "consultations",
      entityId: visitId,
      previousValues,
      reason: trimmedReason,
      editedByStaffId: actorStaffId,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "consultation_amended",
      entityTable: "consultations",
      entityId: visitId,
      detail: { fields: changedFields, reason: trimmedReason },
    });

    return { ok: true as const };
  });
}
