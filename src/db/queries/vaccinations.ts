import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { patients, procedureTasks, procedures, visits } from "@/db/schema";
import {
  buildSchedule,
  dueDoses,
  SCHEDULE,
  type ScheduledDose,
} from "@/lib/clinical/vaccines";

/**
 * Vaccination roster (§7.6 P1).
 *
 * A dose "given" is a completed procedure_task whose procedure name matches
 * one of the schedule's antigens — vaccination is modelled as a procedure
 * like any other (§7.6 P0), not a separate table, so it goes through the same
 * nurse task lifecycle and the same statutory trail as nebulisation or
 * dressing. The match is by name because that is the only link between the
 * fixed clinical schedule and the clinic's own procedure rows; recordDose (in
 * the mutation) is what keeps the two in agreement.
 */

export type ChildVaccinationRow = {
  patientId: string;
  name: string;
  phone: string;
  guardianName: string | null;
  dateOfBirth: string;
  schedule: ScheduledDose[];
  owed: ScheduledDose[];
};

/* Built once: procedure name → schedule dose id. */
const DOSE_ID_BY_NAME = new Map(SCHEDULE.map((d) => [d.name, d.id]));

export async function getVaccinationRoster(
  clinicId: string,
  asOf: string,
  tx: Executor = db,
): Promise<ChildVaccinationRow[]> {
  const children = await tx
    .select({
      id: patients.id,
      name: patients.name,
      phone: patients.phone,
      guardianName: patients.guardianName,
      dateOfBirth: patients.dateOfBirth,
    })
    .from(patients)
    .where(
      and(
        eq(patients.clinicId, clinicId),
        isNull(patients.archivedAt),
        isNull(patients.mergedIntoId),
      ),
    );

  /* Only patients with a recorded date of birth have a schedule — a vaccine
     interval is computed from birth, and an age-in-years record (common for
     adult patients) cannot anchor one. */
  const withDob = children.filter(
    (c): c is typeof c & { dateOfBirth: string } => c.dateOfBirth !== null,
  );

  if (withDob.length === 0) return [];

  const givenRows = await tx
    .select({
      patientId: visits.patientId,
      procedureName: procedures.name,
      completedAt: procedureTasks.completedAt,
    })
    .from(procedureTasks)
    .innerJoin(procedures, eq(procedures.id, procedureTasks.procedureId))
    .innerJoin(visits, eq(visits.id, procedureTasks.visitId))
    .where(
      and(
        eq(procedureTasks.clinicId, clinicId),
        eq(procedureTasks.state, "done"),
        inArray(
          procedures.name,
          SCHEDULE.map((d) => d.name),
        ),
      ),
    );

  const givenByPatient = new Map<string, Record<string, string>>();

  for (const row of givenRows) {
    const doseId = DOSE_ID_BY_NAME.get(row.procedureName);
    if (!doseId) continue; // defensive — the inArray filter already excludes these

    const bucket = givenByPatient.get(row.patientId) ?? {};
    bucket[doseId] = (row.completedAt ?? new Date()).toISOString().slice(0, 10);
    givenByPatient.set(row.patientId, bucket);
  }

  return withDob.map((c) => {
    const schedule = buildSchedule({
      dateOfBirth: c.dateOfBirth,
      givenDoses: givenByPatient.get(c.id) ?? {},
      asOf,
    });

    return {
      patientId: c.id,
      name: c.name,
      phone: c.phone,
      guardianName: c.guardianName,
      dateOfBirth: c.dateOfBirth,
      schedule,
      owed: dueDoses(schedule),
    };
  });
}

/** Resolves the clinic's procedure row id for each vaccine dose, by name. */
export async function getVaccineProcedureIds(
  clinicId: string,
  tx: Executor = db,
): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: procedures.id, name: procedures.name })
    .from(procedures)
    .where(
      and(
        eq(procedures.clinicId, clinicId),
        inArray(
          procedures.name,
          SCHEDULE.map((d) => d.name),
        ),
      ),
    );

  const idByDoseId = new Map<string, string>();
  for (const row of rows) {
    const doseId = DOSE_ID_BY_NAME.get(row.name);
    if (doseId) idByDoseId.set(doseId, row.id);
  }
  return idByDoseId;
}
