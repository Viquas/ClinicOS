import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { doctors, patients, staff, tokens, visits, vitals } from "@/db/schema";
import type { TemplatePackOverride } from "@/lib/clinical/specialties";

export type ConsultContext = {
  tokenId: string;
  tokenState: string;
  patient: {
    id: string;
    name: string;
    sex: string;
    dateOfBirth: string | null;
    ageYears: number | null;
    allergies: string[];
    tags: string[];
  };
  doctor: {
    id: string;
    name: string;
    qualification: string | null;
    registrationNo: string | null;
    registrationCouncil: string | null;
    specialty: string;
    templatePackOverride: TemplatePackOverride | null;
  };
  /* Set only when a nurse already recorded vitals for this visit — the
     consult screen shows them, it never re-captures them. */
  vitals: Record<string, number | string> | null;
};

/**
 * Everything the consultation screen needs for one visit (§7.4): the
 * patient, the token (so the mutation can guard on state), and the treating
 * doctor's identity — including their specialty template, which is what
 * drives the diagnosis favourites shown here.
 */
export async function getConsultContext(
  clinicId: string,
  visitId: string,
  tx: Executor = db,
): Promise<ConsultContext | null> {
  const [visit] = await tx
    .select({ patientId: visits.patientId, doctorId: visits.doctorId })
    .from(visits)
    .where(and(eq(visits.clinicId, clinicId), eq(visits.id, visitId)));

  if (!visit) return null;

  const [token] = await tx
    .select({ id: tokens.id, state: tokens.state })
    .from(tokens)
    .where(and(eq(tokens.clinicId, clinicId), eq(tokens.visitId, visitId)))
    .orderBy(desc(tokens.createdAt))
    .limit(1);

  if (!token) return null;

  const [patient] = await tx
    .select({
      id: patients.id,
      name: patients.name,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      ageYears: patients.ageYears,
      allergies: patients.allergies,
      tags: patients.tags,
    })
    .from(patients)
    .where(
      and(eq(patients.clinicId, clinicId), eq(patients.id, visit.patientId)),
    );

  if (!patient) return null;

  const [doctor] = await tx
    .select({
      id: doctors.id,
      name: staff.name,
      qualification: staff.qualification,
      registrationNo: doctors.registrationNo,
      registrationCouncil: doctors.registrationCouncil,
      specialty: doctors.specialty,
      templatePack: doctors.templatePack,
    })
    .from(doctors)
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    .where(and(eq(doctors.clinicId, clinicId), eq(doctors.id, visit.doctorId)));

  if (!doctor) return null;

  const [vitalsRow] = await tx
    .select({ values: vitals.values })
    .from(vitals)
    .where(and(eq(vitals.clinicId, clinicId), eq(vitals.visitId, visitId)));

  return {
    tokenId: token.id,
    tokenState: token.state,
    patient: {
      id: patient.id,
      name: patient.name,
      sex: patient.sex,
      dateOfBirth: patient.dateOfBirth,
      ageYears: patient.ageYears,
      allergies: patient.allergies ?? [],
      tags: patient.tags ?? [],
    },
    doctor: {
      id: doctor.id,
      name: doctor.name,
      qualification: doctor.qualification,
      registrationNo: doctor.registrationNo,
      registrationCouncil: doctor.registrationCouncil,
      specialty: doctor.specialty,
      templatePackOverride:
        (doctor.templatePack as TemplatePackOverride | null) ?? null,
    },
    vitals: (vitalsRow?.values as Record<string, number | string>) ?? null,
  };
}
