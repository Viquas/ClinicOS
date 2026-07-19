import { getFamily, getPatient, getPatientTimeline } from "@/db/queries/patients";
import { getPatientFiles } from "@/db/queries/patient-files";
import { getRecordRevisions } from "@/db/queries/revisions";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { notFound } from "next/navigation";
import { PatientRecord } from "./patient-record";

/*
 * Always render against current clinic state — a patient chart frozen at build
 * time would hide the visit that just happened. Any page reading mutable
 * clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function PatientRecordPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  const patient = await getPatient(CLINIC_ID, patientId);
  if (!patient) notFound();

  const [timeline, files, currentStaff, family] = await Promise.all([
    getPatientTimeline(CLINIC_ID, patientId),
    getPatientFiles(CLINIC_ID, patientId),
    getCurrentStaff(CLINIC_ID),
    getFamily(CLINIC_ID, patient.phone),
  ]);

  /* One phone number holds several people — the parent's phone with the
     child's record is the pediatric default, not an edge case (§7.1).
     getFamily already existed, fully tested, with real seed data proving
     the concept (Aarav and Diya Prakash share a phone) — it was simply
     never shown on the record page it exists to serve. */
  const familyMembers = family.filter((p) => p.id !== patientId);

  /* Revision history loads only for visits the timeline already marked
     amended — in practice a handful at most, so one query per visit here
     stays cheap and keeps the "what did this used to say" panel available
     without a client-side round trip. */
  const revisionsByVisitId = Object.fromEntries(
    await Promise.all(
      timeline
        .filter((entry) => entry.amended)
        .map(async (entry) => [
          entry.visitId,
          await getRecordRevisions(CLINIC_ID, "consultations", entry.visitId),
        ]),
    ),
  );

  return (
    <PatientRecord
      patient={patient}
      timeline={timeline}
      files={files}
      familyMembers={familyMembers}
      revisionsByVisitId={revisionsByVisitId}
      currentStaff={{
        id: currentStaff.id,
        doctorId: currentStaff.doctorId,
        roles: currentStaff.roles,
      }}
    />
  );
}
