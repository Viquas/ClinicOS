"use server";

import { revalidatePath } from "next/cache";
import {
  issueToken,
  registerPatient,
  type IssueResult,
  type RegisterResult,
} from "@/db/mutations/issue-token";
import { searchPatients } from "@/db/queries/patients";
import { requireCurrentStaffCan } from "@/lib/auth/guard";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export async function searchAction(query: string) {
  return searchPatients(CLINIC_ID, query);
}

export async function issueTokenAction(
  patientId: string,
  doctorId: string,
  isPriority = false,
): Promise<IssueResult> {
  const auth = await requireCurrentStaffCan(CLINIC_ID, "patient:register");
  if (!auth.ok) return auth;

  const result = await issueToken({
    clinicId: CLINIC_ID,
    patientId,
    doctorId,
    onDate: TODAY,
    isPriority,
    actorStaffId: auth.staff.id,
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
  const auth = await requireCurrentStaffCan(CLINIC_ID, "patient:register");
  if (!auth.ok) return auth;

  const result = await registerPatient({
    clinicId: CLINIC_ID,
    actorStaffId: auth.staff.id,
    ...input,
  });

  if (result.ok) {
    revalidatePath("/patients");
    revalidatePath("/reception");
  }

  return result;
}
