# PRD — Real Authentication & Load-Bearing Tenant Isolation

**Status:** Draft for build · **Date:** 2026-07-19
**Builds on:** prd-role-adaptive.md and prd-role-assignment.md (both shipped). Those made roles administrable and enforced in the application. This makes *identity* real and moves the tenant boundary into the database, where it can't be bypassed by an application bug.

---

## Problem Statement

Identity is a cookie. `getCurrentStaff()` reads `clinicos_active_staff_id` and trusts it; anyone who can set a cookie can become the owner of any clinic. That was the right trade while building screens, and it is the wrong one the moment a real patient record exists.

The more serious finding is beneath it. `drizzle/0001_rls_policies.sql` defines 19 policies, a `custom_access_token_hook` that mints `clinic_id` and `staff_roles` into the JWT, and a passing SQL test suite. **None of it applies to a single query the app makes.** The app connects through Drizzle on `DATABASE_URL` (`src/db/index.ts`) as the database owner, and in Postgres a table owner bypasses RLS unconditionally. The RLS tests pass because `drizzle/tests/rls.sql` does `set role authenticated` and sets `request.jwt.claims` by hand — it manufactures the conditions the application never creates.

So today: tenant isolation is enforced by `eq(table.clinicId, clinicId)` appearing in every query by hand. One forgotten `where` clause leaks another clinic's patients, and nothing below the application would stop it. The database protection everyone would assume is there is decorative.

## Goals

1. **Real sign-in.** A staff member authenticates against Supabase (phone OTP), and the session — not a cookie value — determines who they are. The PIN pad returns to its documented job: unlocking an already-established device session, never authenticating from scratch.
2. **RLS becomes load-bearing.** Application queries execute as a role that RLS applies to, carrying verified claims. A query missing its `clinicId` filter returns nothing instead of another clinic's rows — provable by deleting a filter and watching a test fail.
3. **One identity source.** `getCurrentStaff()` and `getActiveClinicId()` keep their signatures and switch from cookie reads to session claims. Call sites do not change; that was the point of routing them through single resolvers.
4. **No regression.** All 510 tests keep passing, and every screen behaves as it does today for a signed-in user.

## Non-Goals

- **Replacing the seeded demo clinic.** The prototype's demo data and role switcher stay available behind a dev-only flag; losing the ability to demo would be a real cost.
- **Multi-factor beyond OTP**, password login, or social auth. Phone OTP matches how Indian clinic staff actually onboard (§7.12).
- **Per-permission overrides** (still P2 from prd-role-assignment.md).
- **File upload and WhatsApp sending.** They depend on Supabase being wired but are separate features with their own scope.

## The Central Decision: How Queries Reach the Database

RLS only engages if the connection is (a) not the table owner and (b) carrying claims. Two ways to get there:

**Option A — route reads through the Supabase client.** Every query rewritten off Drizzle. Rejected: it discards the entire typed query layer and its 300 integration tests for no gain in safety over Option B.

**Option B — keep Drizzle, fix the connection.** Connect as a non-owner role (`authenticated`), and set `request.jwt.claims` per request from the verified session before running queries. This is what `drizzle/tests/rls.sql` already simulates, so the policies are known to work under exactly these conditions.

**Recommendation: B.** It preserves the query layer and test suite, and the change is concentrated in `src/db/index.ts` plus a per-request claim-setting wrapper.

The sharp edge worth naming now: claims must be set on the *same connection* that runs the query. With a pooled client, `set_config` on one connection and a query on another silently gives an empty claim — which fails *closed* (no rows) rather than open, but would look like a baffling empty-screen bug. Every DB call therefore has to go through a helper that pins claims and query to one connection, ideally inside a transaction.

## Requirements

### P0-A — Connection and claims
1. A `withClaims(session, fn)` helper that acquires one connection, sets `request.jwt.claims` (and `role authenticated`) inside a transaction, runs the callback, and releases.
2. `src/db/index.ts` connects as a non-owner role in production. Migrations and the seed continue to run as owner — they must bypass RLS.
3. Every query/mutation module runs inside `withClaims`. Modules keep their explicit `clinicId` filters: defence in depth, not redundancy — RLS is the guarantee, the filter is the intent.
   - *Acceptance:* a deliberately filter-less query returns zero cross-tenant rows under RLS, proven by a test that fails if RLS is disabled.

### P0-B — Supabase Auth
4. Phone OTP sign-in replacing the staff picker at `/login`. On success, the `custom_access_token_hook` mints `clinic_id`, `staff_id`, `staff_roles`.
5. `staff.authUserId` (already in the schema, unused) links a staff row to its Supabase user. Invite flow: owner adds staff → staff signs in with that phone → rows link on first sign-in.
6. `getCurrentStaff()` / `getActiveClinicId()` read verified claims via `getSession()` (`lib/auth/session.ts`, already written and unused). Cookie path survives only behind `CLINICOS_DEMO_MODE`.
7. Middleware protects every non-public route with a real session check; the existing `src/middleware.ts` already does this when Supabase env vars are present — it is currently inert because they are absent.
   - *Acceptance:* signed out, every route redirects to `/login`; a staff member sees only their clinic; role claims match `staff.roles`.

### P0-C — Proving the boundary
8. An integration test that connects as `authenticated` with clinic A's claims and asserts clinic B's patients, visits, bills and prescriptions are invisible — the app-level equivalent of the existing SQL suite.
9. A test that RLS is actually on in the app's connection path (e.g. `current_setting('request.jwt.claims')` is populated inside a real query).

### P1
10. Session expiry and refresh handled without losing in-progress consult data.
11. Deactivating staff revokes their session (currently they keep working until logout).
12. Demo mode banner, so a demo clinic is never mistaken for a real one.

## Success Metrics

- Removing a `clinicId` filter from any query returns **zero** rows cross-tenant rather than leaking — tested, not assumed.
- 510 existing tests still green; no screen behaves differently for a signed-in user.
- Signed-out access to every route redirects rather than rendering.

## Open Questions

- **(Engineering, blocking)** Does the seed/migration path need a separate owner-role connection string, or can one role work with `bypassrls`? Recommendation: two connection strings, explicitly named — implicit privilege is how RLS quietly stops applying.
- **(Product, non-blocking)** Do we keep the PIN pad at all once OTP exists? It has real value on shared tablets; recommendation is keep it as the device-unlock layer it was always documented to be.

## Phasing

1. **Phase A — Connection & claims (highest risk, no user-visible change).** `withClaims`, non-owner role, all modules routed through it, plus the P0-C tests. Ship this alone and verify nothing regresses.
2. **Phase B — Supabase Auth.** OTP sign-in, `authUserId` linking, session-backed resolvers, middleware live. Demo mode flag.
3. **Phase C — P1 hardening.** Expiry/refresh, session revocation, demo banner.

Phase A is deliberately first and deliberately invisible: it is where the security property actually comes from, and doing it under real auth would confound two hard changes at once.

---

*Verification bar unchanged: tsc + lint + both suites green from a clean reset, production build dynamic-route check, and live browser verification against psql ground truth.*
