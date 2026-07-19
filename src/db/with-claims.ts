import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";

export type TenantClaims = {
  clinicId: string;
  staffId: string;
  staffRoles: string[];
};

/**
 * Runs a callback against the database with RLS actually applying — PRD §10,
 * prd-real-auth.md Phase A.
 *
 * Why this exists: the application connects as the database owner, and a
 * table owner bypasses RLS unconditionally in Postgres. So all 19 policies in
 * 0001_rls_policies.sql applied to precisely nothing the app did. Tenant
 * isolation rested entirely on every query remembering its clinicId filter,
 * with nothing underneath to catch a miss. The RLS test suite passed because
 * it issued `set role authenticated` by hand — it manufactured conditions the
 * application never created.
 *
 * Three things have to be true at once for a policy to bite, and all three
 * are set here:
 *
 *  1. `role authenticated` — a role without BYPASSRLS. Owner connections skip
 *     policies even when the table has FORCE ROW LEVEL SECURITY.
 *  2. `request.jwt.claims` — what current_clinic_id() and has_role() read.
 *  3. Both on the SAME connection as the query. This is the sharp edge of a
 *     pooled client: SET on one connection and SELECT on another leaves the
 *     claim empty, current_clinic_id() returns null, and every policy
 *     evaluates false. That fails CLOSED — an empty screen, not a leak — but
 *     it would present as a baffling bug, so the transaction below is what
 *     pins all three together. drizzle's `transaction()` guarantees one
 *     connection for its duration.
 *
 * SET LOCAL, not SET: the role and claims revert when the transaction ends,
 * so a pooled connection can never be handed to the next request still
 * wearing the last caller's identity.
 *
 * Callers keep their explicit `eq(table.clinicId, clinicId)` filters. That is
 * defence in depth, not redundancy: RLS is the guarantee that survives a
 * mistake, the filter is the statement of intent that keeps queries readable
 * and lets the planner use the clinic indexes.
 */
export async function withClaims<T>(
  claims: TenantClaims,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  const payload = JSON.stringify({
    clinic_id: claims.clinicId,
    staff_id: claims.staffId,
    staff_roles: claims.staffRoles,
  });

  return db.transaction(async (tx) => {
    /*
     * set_config(..., true) is the function form of SET LOCAL — parameterised,
     * so the claim payload is bound rather than interpolated into SQL text.
     * `set local role` has no function form and takes no parameters, but the
     * role name here is a literal, never caller input.
     */
    await tx.execute(sql`set local role authenticated`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${payload}, true)`,
    );

    return fn(tx);
  });
}
