import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  auditLog,
  consultations,
  prescriptionItems,
  prescriptions,
  tokens,
} from "@/db/schema";

export type PrescriptionLineInput = {
  inventoryItemId: string | null;
  drugName: string;
  strength: string | null;
  dosage: string;
  durationDays: number | null;
  scheduleClass: string;
  allergyOverrideReason: string | null;
};

export type RecordConsultationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Completes a consultation (§7.4): the diagnosis is the clinical record and
 * is required; a prescription is not — plenty of real visits end in advice
 * with nothing to dispense, and a doctor with no prescribing registration
 * (§9.2) must still be able to close a visit, just not add drugs to it.
 *
 * One transaction because a partial write here is worse than any single
 * piece failing outright: a prescription with no consultation row behind it,
 * or a token stuck at "with_doctor" after the doctor already left the
 * screen, are both states nobody can recover from at the counter.
 *
 * Every visit goes to "at_pharmacy" next, prescription or not — pharmacy's
 * own screen renders "nothing to dispense" when there is nothing, and
 * billing already treats at_pharmacy as billable (see queries/billable.ts).
 */
export async function recordConsultation({
  clinicId,
  visitId,
  tokenId,
  doctorId,
  actorStaffId,
  diagnosis,
  advice,
  followUpDate,
  lines,
  executor = db,
}: {
  clinicId: string;
  visitId: string;
  tokenId: string;
  doctorId: string;
  actorStaffId: string | null;
  diagnosis: string;
  advice: string | null;
  followUpDate: string | null;
  lines: PrescriptionLineInput[];
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<RecordConsultationResult> {
  if (!diagnosis.trim()) {
    return { ok: false, error: "A diagnosis is required to close the visit" };
  }

  return executor.transaction(async (tx) => {
    const result = await tx
      .update(tokens)
      .set({ state: "at_pharmacy", updatedAt: new Date() })
      .where(
        and(
          eq(tokens.clinicId, clinicId),
          eq(tokens.id, tokenId),
          eq(tokens.state, "with_doctor"),
        ),
      )
      .returning({ id: tokens.id });

    if (result.length === 0) {
      return {
        ok: false as const,
        error: "This visit is no longer with the doctor",
      };
    }

    await tx.insert(consultations).values({
      clinicId,
      visitId,
      doctorId,
      diagnosis: diagnosis.trim(),
      advice: advice?.trim() || null,
      followUpDate,
    });

    if (lines.length > 0) {
      const [prescription] = await tx
        .insert(prescriptions)
        .values({
          clinicId,
          visitId,
          doctorId,
          /*
           * Frozen at signing time (§9.2) — the doctor's registration must
           * reflect what was true today, not whatever the profile says when
           * someone later opens the printed copy. Clinic letterhead detail
           * (address, GSTIN) joins this snapshot once PDF generation exists;
           * nothing reads it yet, so it is not fabricated here.
           */
          issuedSnapshot: { doctorId },
          signedAt: new Date(),
        })
        .returning({ id: prescriptions.id });

      await tx.insert(prescriptionItems).values(
        lines.map((line) => ({
          clinicId,
          prescriptionId: prescription.id,
          inventoryItemId: line.inventoryItemId,
          drugName: line.drugName,
          strength: line.strength,
          dosage: line.dosage,
          durationDays: line.durationDays,
          scheduleClass: line.scheduleClass as "none" | "h" | "h1" | "x",
          allergyOverrideReason: line.allergyOverrideReason,
        })),
      );
    }

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "consultation_completed",
      entityTable: "consultations",
      entityId: visitId,
      detail: { prescriptionLineCount: lines.length },
    });

    return { ok: true as const };
  });
}
