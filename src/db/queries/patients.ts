import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  consultations,
  doctors,
  patients,
  recordRevisions,
  staff,
  visits,
  vitals,
} from "@/db/schema";

/**
 * Patient reads (§7.1).
 *
 * Search matches phone OR name, because front desk uses whichever the patient
 * offers first. Phone is matched as a substring so the last four digits work —
 * that is what people recite from memory, and §7.1 makes it the fast path.
 */

export type PatientSummary = {
  id: string;
  name: string;
  phone: string;
  sex: string;
  dateOfBirth: string | null;
  ageYears: number | null;
  guardianName: string | null;
  allergies: string[];
  tags: string[];
  /* DPDP Act 2023 consent (§9.1) — captured once at registration by
     registerPatient and, until now, never read back anywhere. An inspector
     or a front-desk audit needs to see it was actually captured, not just
     trust that it was. */
  consentGivenAt: string | null;
};

const summaryColumns = {
  id: patients.id,
  name: patients.name,
  phone: patients.phone,
  sex: patients.sex,
  dateOfBirth: patients.dateOfBirth,
  ageYears: patients.ageYears,
  guardianName: patients.guardianName,
  allergies: patients.allergies,
  tags: patients.tags,
  consentGivenAt: patients.consentGivenAt,
};

function normalise(row: {
  allergies: unknown;
  tags: unknown;
  [k: string]: unknown;
}) {
  return {
    ...row,
    allergies: (row.allergies as string[]) ?? [],
    tags: (row.tags as string[]) ?? [],
  } as PatientSummary;
}

/**
 * Excludes merged-away duplicates. A record that has been merged into another
 * still exists — §9.6 forbids deleting it — but it must not appear in search,
 * or front desk will reopen the very duplicate they just resolved.
 */
const livePatient = (clinicId: string) =>
  and(
    eq(patients.clinicId, clinicId),
    isNull(patients.archivedAt),
    isNull(patients.mergedIntoId),
  );

export async function listPatients(
  clinicId: string,
  tx: Executor = db,
): Promise<PatientSummary[]> {
  const rows = await tx
    .select(summaryColumns)
    .from(patients)
    .where(livePatient(clinicId))
    .orderBy(patients.name);

  return rows.map(normalise);
}

export async function searchPatients(
  clinicId: string,
  query: string,
  tx: Executor = db,
): Promise<PatientSummary[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const rows = await tx
    .select(summaryColumns)
    .from(patients)
    .where(
      and(
        livePatient(clinicId),
        or(
          /* Substring, not prefix: "2233" must find 9845012233. */
          sql`${patients.phone} like ${"%" + term + "%"}`,
          sql`${patients.name} ilike ${"%" + term + "%"}`,
        ),
      ),
    )
    .orderBy(patients.name);

  return rows.map(normalise);
}

export async function getPatient(
  clinicId: string,
  patientId: string,
  tx: Executor = db,
): Promise<PatientSummary | null> {
  const [row] = await tx
    .select(summaryColumns)
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, patientId)))
    .limit(1);

  return row ? normalise(row) : null;
}

/** Everyone sharing a phone number — the family (§7.1). */
export async function getFamily(
  clinicId: string,
  phone: string,
  tx: Executor = db,
): Promise<PatientSummary[]> {
  const rows = await tx
    .select(summaryColumns)
    .from(patients)
    .where(and(livePatient(clinicId), eq(patients.phone, phone)))
    .orderBy(patients.name);

  return rows.map(normalise);
}

export type TimelineEntry = {
  visitId: string;
  visitDate: string;
  doctorId: string;
  doctorName: string;
  diagnosis: string | null;
  advice: string | null;
  followUpDate: string | null;
  vitals: Record<string, number | string> | null;
  /* Whether amendConsultation has ever corrected this visit's consultation —
     drives the timeline's "Amended" marker (§9's editing model). A
     correction must never be presented as if it were the original entry. */
  amended: boolean;
};

/**
 * The longitudinal record (§7.1), newest first — the question a doctor is
 * actually asking is "what happened last time?".
 */
export async function getPatientTimeline(
  clinicId: string,
  patientId: string,
  tx: Executor = db,
): Promise<TimelineEntry[]> {
  const rows = await tx
    .select({
      visitId: visits.id,
      visitDate: visits.visitDate,
      doctorId: doctors.id,
      doctorName: staff.name,
      diagnosis: consultations.diagnosis,
      advice: consultations.advice,
      followUpDate: consultations.followUpDate,
      vitalsValues: vitals.values,
      amended: sql<boolean>`exists (
        select 1 from ${recordRevisions}
        where ${recordRevisions.clinicId} = ${clinicId}
          and ${recordRevisions.entityTable} = 'consultations'
          and ${recordRevisions.entityId} = ${visits.id}
      )`,
    })
    .from(visits)
    .innerJoin(doctors, eq(doctors.id, visits.doctorId))
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    /* Left joins throughout: a review visit may carry no consultation row and
       no vitals, and it still belongs on the timeline. An inner join would
       silently drop exactly the visits that look "empty". */
    .leftJoin(consultations, eq(consultations.visitId, visits.id))
    .leftJoin(vitals, eq(vitals.visitId, visits.id))
    .where(
      and(
        eq(visits.clinicId, clinicId),
        eq(visits.patientId, patientId),
        isNull(visits.archivedAt),
      ),
    )
    .orderBy(desc(visits.visitDate));

  return rows.map((row) => ({
    visitId: row.visitId,
    visitDate: row.visitDate,
    doctorId: row.doctorId,
    doctorName: row.doctorName,
    diagnosis: row.diagnosis,
    advice: row.advice,
    followUpDate: row.followUpDate,
    vitals: row.vitalsValues ?? null,
    amended: row.amended,
  }));
}
