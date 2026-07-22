import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  clinics,
  consultations,
  doctors,
  patients,
  prescriptionItems,
  prescriptions,
  staff,
  visits,
} from "@/db/schema";

export type PrescriptionPrintLine = {
  drugName: string;
  strength: string | null;
  dosage: string;
  durationDays: number | null;
  instructions: string | null;
  scheduleClass: "none" | "h" | "h1" | "x";
};

export type PrescriptionPrintData = {
  clinic: {
    name: string;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
    ceaRegistrationNo: string | null;
  };
  doctor: {
    name: string;
    qualification: string | null;
    specialty: string;
    registrationNo: string | null;
    registrationCouncil: string | null;
  };
  patient: {
    id: string;
    name: string;
    sex: string;
    dateOfBirth: string | null;
    ageYears: number | null;
    phone: string;
    allergies: string[];
  };
  visit: {
    id: string;
    date: string;
    diagnosis: string | null;
    advice: string | null;
    followUpDate: string | null;
  };
  /** Null for an advice-only visit — the slip then carries no QR/Rx-ID. */
  prescriptionId: string | null;
  lines: PrescriptionPrintLine[];
};

/**
 * Everything a printed prescription slip needs for one visit (§9.2).
 *
 * A single query rather than reusing getConsultContext + a separate Rx read:
 * the print view is a read-only leaf that renders once, so it fetches its own
 * exact shape — clinic letterhead, the treating doctor's credentials, the
 * patient header, the consultation body, and the drug lines in the order they
 * were prescribed.
 *
 * Returns the visit even when it carries no prescription: an advice-only visit
 * still produces a valid slip (diagnosis + advice + follow-up), which is what
 * a doctor hands a patient who needs rest and a review, not a drug.
 */
export async function getPrescriptionPrintData(
  clinicId: string,
  visitId: string,
  tx: Executor = db,
): Promise<PrescriptionPrintData | null> {
  const [visit] = await tx
    .select({
      id: visits.id,
      date: visits.visitDate,
      patientId: visits.patientId,
      doctorId: visits.doctorId,
      diagnosis: consultations.diagnosis,
      advice: consultations.advice,
      followUpDate: consultations.followUpDate,
    })
    .from(visits)
    .leftJoin(consultations, eq(consultations.visitId, visits.id))
    .where(and(eq(visits.clinicId, clinicId), eq(visits.id, visitId)));

  if (!visit) return null;

  const [clinic] = await tx
    .select({
      name: clinics.name,
      addressLine: clinics.addressLine,
      city: clinics.city,
      state: clinics.state,
      pincode: clinics.pincode,
      phone: clinics.phone,
      ceaRegistrationNo: clinics.ceaRegistrationNo,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId));

  if (!clinic) return null;

  const [patient] = await tx
    .select({
      id: patients.id,
      name: patients.name,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      ageYears: patients.ageYears,
      phone: patients.phone,
      allergies: patients.allergies,
    })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, visit.patientId)));

  if (!patient) return null;

  const [doctor] = await tx
    .select({
      name: staff.name,
      qualification: staff.qualification,
      specialty: doctors.specialty,
      registrationNo: doctors.registrationNo,
      registrationCouncil: doctors.registrationCouncil,
    })
    .from(doctors)
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    .where(and(eq(doctors.clinicId, clinicId), eq(doctors.id, visit.doctorId)));

  if (!doctor) return null;

  /* The latest prescription for the visit — a visit has at most one in the
     record-consultation path, but ordering by signedAt keeps the print
     correct even if a correction flow ever issues a second. */
  const [prescription] = await tx
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(and(eq(prescriptions.clinicId, clinicId), eq(prescriptions.visitId, visitId)))
    .orderBy(desc(prescriptions.signedAt))
    .limit(1);

  const lines = prescription
    ? await tx
        .select({
          drugName: prescriptionItems.drugName,
          strength: prescriptionItems.strength,
          dosage: prescriptionItems.dosage,
          durationDays: prescriptionItems.durationDays,
          instructions: prescriptionItems.instructions,
          scheduleClass: prescriptionItems.scheduleClass,
        })
        .from(prescriptionItems)
        .where(
          and(
            eq(prescriptionItems.clinicId, clinicId),
            eq(prescriptionItems.prescriptionId, prescription.id),
          ),
        )
        .orderBy(asc(prescriptionItems.createdAt))
    : [];

  return {
    clinic,
    doctor,
    patient: {
      id: patient.id,
      name: patient.name,
      sex: patient.sex,
      dateOfBirth: patient.dateOfBirth,
      ageYears: patient.ageYears,
      phone: patient.phone,
      allergies: patient.allergies ?? [],
    },
    visit: {
      id: visit.id,
      date: visit.date,
      diagnosis: visit.diagnosis,
      advice: visit.advice,
      followUpDate: visit.followUpDate,
    },
    prescriptionId: prescription?.id ?? null,
    lines,
  };
}
