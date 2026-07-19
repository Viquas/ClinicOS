import "server-only";
import { cookies } from "next/headers";

/**
 * Which clinic this device is working in.
 *
 * Every page used to hardcode the seeded clinic's UUID as a local constant,
 * which meant a clinic created by onboarding was real in the database and
 * invisible in the app — you could complete the wizard and still be looking
 * at the demo clinic. Routing that through one resolver makes onboarding's
 * output reachable, and gives real multi-tenant auth a single place to
 * replace later (session claim instead of cookie), exactly as
 * getCurrentStaff() does for identity.
 */
const COOKIE_NAME = "clinicos_active_clinic_id";

/* The seeded demo clinic — what a fresh device sees before onboarding. */
export const SEEDED_CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function getActiveClinicId(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? SEEDED_CLINIC_ID;
}

export { COOKIE_NAME as ACTIVE_CLINIC_COOKIE };
