import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, procedureTasks, procedures, visits } from "@/db/schema";
import { SCHEDULE } from "@/lib/clinical/vaccines";

/**
 * Records a vaccine dose as given (§7.6 P1).
 *
 * A parent walking in specifically for a vaccination has no prior consultation
 * visit to attach the dose to, so this creates one — a vaccination is a real
 * clinical encounter, not a footnote on some other visit. The dose itself is
 * recorded as an already-completed procedure task, going through the same
 * table (and so the same audit trail) as a nurse marking nebulisation done.
 *
 * No consumable deduction here: modelling a vial per antigen would need a
 * formulary entry for each of the schedule's 21 doses, which is out of scope
 * for this pass. The charge is fixed at zero for the same reason — most of
 * the schedule is the free government-aligned programme in an Indian
 * pediatric practice; a private add-on vaccine would need its own charge,
 * which is a formulary decision, not something this mutation should guess at.
 */

export type RecordDoseResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

export async function recordVaccineDose({
  clinicId,
  patientId,
  doseId,
  doctorId,
  actorStaffId,
  givenOn,
  executor = db,
}: {
  clinicId: string;
  patientId: string;
  doseId: string;
  doctorId: string;
  actorStaffId: string | null;
  /** ISO date the dose was actually given — defaults to today if omitted. */
  givenOn?: string;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<RecordDoseResult> {
  const dose = SCHEDULE.find((d) => d.id === doseId);
  if (!dose) return { ok: false, error: "Unknown vaccine dose" };

  try {
    return await executor.transaction(async (tx) => {
      const [matched] = await tx
        .select({ id: procedures.id })
        .from(procedures)
        .where(
          and(eq(procedures.clinicId, clinicId), eq(procedures.name, dose.name)),
        );

      if (!matched) {
        /* The seed/formulary has not created a procedure row for this
           antigen — a data-setup gap, not a user error, so it is reported
           distinctly rather than as "unknown dose". */
        return {
          ok: false as const,
          error: `${dose.name} is not set up as a procedure yet`,
        };
      }

      const completedAt = givenOn
        ? new Date(`${givenOn}T12:00:00Z`)
        : new Date();

      const [visit] = await tx
        .insert(visits)
        .values({
          clinicId,
          patientId,
          doctorId,
          visitDate: completedAt.toISOString().slice(0, 10),
        })
        .returning({ id: visits.id });

      const [task] = await tx
        .insert(procedureTasks)
        .values({
          clinicId,
          visitId: visit.id,
          procedureId: matched.id,
          assignedToStaffId: actorStaffId,
          state: "done",
          completedAt,
        })
        .returning({ id: procedureTasks.id });

      await tx.insert(auditLog).values({
        clinicId,
        actorStaffId,
        action: "vaccine_dose_recorded",
        entityTable: "procedure_tasks",
        entityId: task.id,
        detail: { dose: dose.name, patientId, givenOn: completedAt.toISOString().slice(0, 10) },
      });

      return { ok: true as const, taskId: task.id };
    });
  } catch (error) {
    console.error("recordVaccineDose failed", error);
    return { ok: false, error: "Could not record the dose" };
  }
}
