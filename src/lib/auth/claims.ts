import { z } from "zod";

/**
 * The claims the custom access token hook writes into the JWT
 * (see drizzle/0001_rls_policies.sql).
 *
 * These are the same values RLS reads, which is the point: the database and
 * the application agree on who the caller is because they read one source.
 * Application checks are a usability layer — they produce good error messages
 * and hide unusable UI — while the database remains the actual boundary.
 */

export const STAFF_ROLES = [
  "owner",
  "doctor",
  "front_desk",
  "nurse",
  "pharmacy",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const clinicClaimsSchema = z.object({
  clinic_id: z.uuid(),
  staff_id: z.uuid(),
  staff_roles: z.array(z.enum(STAFF_ROLES)).min(1),
});

export type ClinicClaims = z.infer<typeof clinicClaimsSchema>;

export type Session = {
  userId: string;
  clinicId: string;
  staffId: string;
  roles: StaffRole[];
};

/**
 * Returns null rather than throwing when the claims are absent or malformed.
 *
 * Absent claims are an expected state, not an error: a user who signed up but
 * whose staff record was deactivated holds a valid Supabase session with no
 * clinic attached. They are authenticated but belong to no clinic, and every
 * RLS policy will already be denying them rows.
 */
export function parseClaims(
  jwtClaims: unknown,
  userId: string,
): Session | null {
  const parsed = clinicClaimsSchema.safeParse(jwtClaims);
  if (!parsed.success) return null;

  return {
    userId,
    clinicId: parsed.data.clinic_id,
    staffId: parsed.data.staff_id,
    roles: parsed.data.staff_roles,
  };
}
