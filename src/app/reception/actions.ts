"use server";

import { revalidatePath } from "next/cache";
import {
  issueToken,
  registerPatient,
  type IssueResult,
  type RegisterResult,
} from "@/db/mutations/issue-token";
import { searchPatients } from "@/db/queries/patients";

/* Until auth is wired these come from the session; see queue/page.tsx. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_STAFF_ID = "22222222-0000-0000-0000-000000000004";
const TODAY = "2026-07-18";

export async function searchAction(query: string) {
  return searchPatients(CLINIC_ID, query);
}

export async function issueTokenAction(
  patientId: string,
  doctorId: string,
  isPriority = false,
): Promise<IssueResult> {
  const result = await issueToken({
    clinicId: CLINIC_ID,
    patientId,
    doctorId,
    onDate: TODAY,
    isPriority,
    actorStaffId: ACTOR_STAFF_ID,
  });

  if (result.ok) {
    /* The queue is the screen that must reflect this immediately. */
    revalidatePath("/queue");
    revalidatePath("/reception");
  }

  return result;
}

export async function registerPatientAction(input: {
  name: string;
  phone: string;
  sex: "male" | "female" | "other";
  dateOfBirth?: string | null;
  ageYears?: number | null;
  guardianName?: string | null;
}): Promise<RegisterResult> {
  const result = await registerPatient({
    clinicId: CLINIC_ID,
    actorStaffId: ACTOR_STAFF_ID,
    ...input,
  });

  if (result.ok) {
    revalidatePath("/patients");
    revalidatePath("/reception");
  }

  return result;
}
