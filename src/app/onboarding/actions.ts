"use server";

import { cookies } from "next/headers";
import {
  createClinic,
  type CreateClinicResult,
} from "@/db/mutations/create-clinic";
import { ACTIVE_CLINIC_COOKIE } from "@/lib/auth/current-clinic";
import { CURRENT_STAFF_COOKIE } from "@/lib/auth/current-staff";

/**
 * Completing the wizard switches the device into the clinic it just created
 * and signs the owner in — otherwise you finish onboarding and land back in
 * the demo clinic, which is how this screen behaved before it persisted
 * anything at all.
 */
export async function createClinicAction(
  input: Parameters<typeof createClinic>[0],
): Promise<CreateClinicResult> {
  const result = await createClinic(input);
  if (!result.ok) return result;

  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  cookieStore.set(ACTIVE_CLINIC_COOKIE, result.clinicId, options);
  cookieStore.set(CURRENT_STAFF_COOKIE, result.ownerStaffId, options);

  return result;
}
