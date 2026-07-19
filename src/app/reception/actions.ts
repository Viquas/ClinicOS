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
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { tenantDb } from "@/db/tenant-db";

const TODAY = "2026-07-18";

export async function searchAction(query: string) {
  /* Patient search reads through RLS (prd-real-auth.md Phase A) — this is
     the one path that takes arbitrary operator input, so it is the least
     comfortable place to rely on a hand-written filter alone. */
  const clinicId = await getActiveClinicId();
  return tenantDb((tx) => searchPatients(clinicId, query, tx));
}

export async function issueTokenAction(
  patientId: string,
  doctorId: string,
  isPriority = false,
): Promise<IssueResult> {
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "patient:register");
  if (!auth.ok) return auth;

  const result = await issueToken({
    clinicId: await getActiveClinicId(),
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
  const auth = await requireCurrentStaffCan(await getActiveClinicId(), "patient:register");
  if (!auth.ok) return auth;

  const result = await registerPatient({
    clinicId: await getActiveClinicId(),
    actorStaffId: auth.staff.id,
    ...input,
  });

  if (result.ok) {
    revalidatePath("/patients");
    revalidatePath("/reception");
  }

  return result;
}
