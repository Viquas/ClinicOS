import "server-only";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { doctors, patients, tokens, visits, vitals } from "@/db/schema";
import type { TemplatePackOverride } from "@/lib/clinical/specialties";

export type VitalsCaptureContext = {
  tokenId: string;
  tokenState: string;
  patient: {
    id: string;
    name: string;
    phone: string;
    sex: string;
    dateOfBirth: string | null;
    ageYears: number | null;
    allergies: string[];
  };
  doctorSpecialty: string | null;
  templatePackOverride: TemplatePackOverride | null;
  /* Last recorded value per field key, from this patient's most recent PRIOR
     visit — never this visit, which is exactly what a nurse checks against
     to catch a transposed digit, not what they are about to overwrite. */
  priorValues: Record<string, string | number>;
};

/**
 * Everything the vitals-capture screen needs for one visit (§7.3), gathered
 * in one place so the page component stays a thin fetch-then-render rather
 * than reaching into four tables itself.
 */
export async function getVitalsCaptureContext(
  clinicId: string,
  visitId: string,
): Promise<VitalsCaptureContext | null> {
  const [visit] = await db
    .select({
      patientId: visits.patientId,
      doctorId: visits.doctorId,
      visitDate: visits.visitDate,
    })
    .from(visits)
    .where(and(eq(visits.clinicId, clinicId), eq(visits.id, visitId)));

  if (!visit) return null;

  const [token] = await db
    .select({ id: tokens.id, state: tokens.state })
    .from(tokens)
    .where(and(eq(tokens.clinicId, clinicId), eq(tokens.visitId, visitId)))
    .orderBy(desc(tokens.createdAt))
    .limit(1);

  if (!token) return null;

  const [patient] = await db
    .select({
      id: patients.id,
      name: patients.name,
      phone: patients.phone,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      ageYears: patients.ageYears,
      allergies: patients.allergies,
    })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, visit.patientId)));

  if (!patient) return null;

  const [doctor] = await db
    .select({ specialty: doctors.specialty, templatePack: doctors.templatePack })
    .from(doctors)
    .where(and(eq(doctors.clinicId, clinicId), eq(doctors.id, visit.doctorId)));

  const [priorVisit] = await db
    .select({ visitId: vitals.visitId, values: vitals.values })
    .from(vitals)
    .innerJoin(visits, eq(visits.id, vitals.visitId))
    .where(
      and(
        eq(vitals.clinicId, clinicId),
        eq(visits.patientId, visit.patientId),
        ne(visits.id, visitId),
        isNull(visits.archivedAt),
      ),
    )
    /* visitDate alone cannot break a tie between two visits on the same
       calendar day — createdAt as the secondary key makes "most recent
       prior visit" deterministic rather than whatever order Postgres
       happens to return. */
    .orderBy(desc(visits.visitDate), desc(visits.createdAt))
    .limit(1);

  return {
    tokenId: token.id,
    tokenState: token.state,
    patient: {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      sex: patient.sex,
      dateOfBirth: patient.dateOfBirth,
      ageYears: patient.ageYears,
      allergies: patient.allergies ?? [],
    },
    doctorSpecialty: doctor?.specialty ?? null,
    templatePackOverride:
      (doctor?.templatePack as { vitals?: string[]; diagnosisFavourites?: string[] } | null) ??
      null,
    priorValues: (priorVisit?.values as Record<string, string | number>) ?? {},
  };
}
