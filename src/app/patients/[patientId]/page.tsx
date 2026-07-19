import { getFamily, getPatient, getPatientTimeline } from "@/db/queries/patients";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
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


export default async function PatientRecordPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  const patient = await getPatient(await getActiveClinicId(), patientId);
  if (!patient) notFound();

  const [timeline, files, currentStaff, family] = await Promise.all([
    getPatientTimeline(await getActiveClinicId(), patientId),
    getPatientFiles(await getActiveClinicId(), patientId),
    getCurrentStaff(await getActiveClinicId()),
    getFamily(await getActiveClinicId(), patient.phone),
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
          await getRecordRevisions(await getActiveClinicId(), "consultations", entry.visitId),
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
