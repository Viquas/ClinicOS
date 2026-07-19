import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { clinics, staff } from "@/db/schema";

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
 *
 * The cookie is VALIDATED rather than trusted. A cookie naming a clinic that
 * no longer exists — dropped in a reseed, or deleted outright — otherwise
 * resolves a clinic with no staff, which made getCurrentStaff() throw from
 * the root layout and took the whole app down with no way back in: every
 * route including /login renders inside that layout. Falling back to a real
 * clinic keeps a stale cookie an inconvenience instead of a lockout.
 */
const COOKIE_NAME = "clinicos_active_clinic_id";

/* The seeded demo clinic — what a fresh device sees before onboarding. */
export const SEEDED_CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export async function getActiveClinicId(): Promise<string> {
  const cookieStore = await cookies();
  const requested = cookieStore.get(COOKIE_NAME)?.value;

  if (requested && (await clinicIsUsable(requested))) return requested;
  if (await clinicIsUsable(SEEDED_CLINIC_ID)) return SEEDED_CLINIC_ID;

  /* Neither the cookie's clinic nor the seeded one is usable — pick the
     oldest clinic that has someone able to sign in. */
  const [fallback] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .innerJoin(staff, eq(staff.clinicId, clinics.id))
    .where(and(eq(staff.isActive, true), isNull(staff.archivedAt)))
    .orderBy(asc(clinics.createdAt))
    .limit(1);

  return fallback?.id ?? SEEDED_CLINIC_ID;
}

/** A clinic is usable only if someone can actually sign into it. */
async function clinicIsUsable(clinicId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(
      and(
        eq(staff.clinicId, clinicId),
        eq(staff.isActive, true),
        isNull(staff.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export { COOKIE_NAME as ACTIVE_CLINIC_COOKIE };
