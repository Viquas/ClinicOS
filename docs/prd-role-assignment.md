# PRD — Role Assignment & Permission Enforcement

**Status:** Draft for build · **Author:** Fable 5 planning pass · **Date:** 2026-07-19
**Builds on:** prd-role-adaptive.md (Phases A–C, shipped). The role *experience* exists — filtered nav, role homes, role-aware editing. This PRD makes roles *administrable* (the owner decides who holds what) and *enforced* (the server refuses what the nav merely hides).

---

## Problem Statement

Roles today are frozen at seed time: `staff.roles` is a real, role-stacked array driving nav and home screens, but no screen can change it — the owner of a real clinic could never grant their nurse pharmacy duties (the "small clinic, nurse also dispenses" case this PRD exists for), never onboard a new hire, never deactivate someone who left. And because no server action checks permissions, the role system is currently cosmetic: any signed-in user can invoke any mutation by URL. Meanwhile the build audit found the audit trail itself is mis-attributed — 9 of 11 action files still hardcode a fixed actor id from before the role switcher existed, so a bill collected while the owner is signed in is logged as Rekha.

## Goals

1. **Owner-administrable roles.** From Settings → Staff, the owner assigns/removes roles per staff member (stacking preserved — nurse + pharmacy is one person, one login), with the same reason-required, revision-logged discipline as patient edits.
2. **Server-enforced permissions.** Every mutating server action resolves the *actual* signed-in staff and refuses actions their roles don't permit, using the existing (tested, unused) `can()`/`assertCan` layer. Nav stays wayfinding; the server becomes the gate.
3. **Truthful audit trail.** Every action is attributed to whoever is actually signed in — no hardcoded actor ids anywhere.
4. **Immediately visible effect.** A role change shows up on the affected person's next navigation: nav, home sections, and now their allowed actions — demoable end-to-end with the role switcher.

## Non-Goals

- **Real authentication / invites via phone OTP.** Unchanged from before; adding staff creates the record, not a login.
- **Per-permission custom matrices** (granting one permission without its role). Roles remain the unit of grant; a "small pharmacy" grant = the pharmacy role. Fine-grained overrides stay P2 as previously documented.
- **Editing the permission table itself.** `ROLE_PERMISSIONS` stays code — it is the product's opinion of what a role means (§7.8), not clinic configuration.
- **Page-level read blocking.** Enforcement lands on mutations (where harm lives). Redirecting unauthorized page *reads* is P1 polish, not P0.

## User Stories

- As the **owner**, I want to grant Latha (nurse) the pharmacy role so that in my two-person clinic she can dispense — and see Pharmacy appear in her nav and home the next time she navigates.
- As the **owner**, I want to add a new front-desk hire and deactivate someone who left, so the staff list reflects reality.
- As the **owner**, I want every role change recorded (who, when, why, what changed) so a dispute has an answer.
- As a **nurse without the pharmacy role**, when I somehow reach the pharmacy screen by URL, I want my dispense attempt refused with a clear "your role can't do this" — not a silent success.
- As **any staff member**, I want what I did today attributed to *me* in the audit log, not to whoever's id was hardcoded.

## Requirements

### P0-A — Audit-attribution fix (do first; everything else builds on it)
1. Replace every hardcoded `ACTOR_STAFF_ID` with `getCurrentStaff()` in: billing, inventory, patients (merge), mr, vaccinations, pharmacy, tasks, reception, vitals actions. (consult + patient-record already do this.)
   - *Acceptance:* grep for `ACTOR_STAFF_ID` in `src/app` returns nothing; an itest-adjacent browser check confirms an action performed while signed in as X logs actor X.

### P0-B — Permission enforcement
2. A single helper (e.g. `requireCurrentStaffCan(permission)` in `lib/auth`) that resolves `getCurrentStaff()`, checks `can(roles, permission)`, and returns the identity or a refusal — used at the top of every mutating server action with the mapping: dispense→`prescription:dispense`, bill→`bill:create`, purchase/adjust→`inventory:*`, vitals→`vitals:record`, consult→`consultation:write`+`prescription:write` for lines, register/merge→`patient:*`, tasks→`procedure:execute`, vaccination dose→`procedure:execute`, MR→`mr:manage`, role admin→`staff:manage`.
   - *Acceptance:* itests per guarded action: permitted role succeeds, unpermitted role gets `{ok:false}` with a role-naming message and writes nothing; owner passes everything.
3. Refusals are friendly and specific ("Front desk can't dispense — ask someone with pharmacy access"), rendered through each screen's existing error banner.

### P0-C — Staff & role management (Settings → Staff)
4. `updateStaffRoles` mutation: owner-only, reason required, diffs against current roles, writes `record_revisions` (entity `staff`) + `audit_log` (`staff_roles_changed`) in one transaction — the exact pattern shipped for patient edits.
5. **Doctor-role side effects:** granting `doctor` creates the `doctors` row (specialty required at grant time, chosen from the specialty registry; registrationNo optional — prescribing stays blocked until it's added, exactly as Dr. Anand demonstrates today). Removing `doctor` archives nothing and deletes nothing — history keeps joining; the person just stops appearing as a bookable doctor (P1 hides them from doctor pickers).
6. `addStaff` mutation + dialog: name, phone, roles, qualification. `setStaffActive` for deactivate/reactivate (archive-not-delete discipline).
7. UI: each staff card gets owner-visible "Edit roles" (role checkboxes + specialty select when doctor is being granted + reason field) and "Deactivate"; an "Add staff member" action tops the tab. Non-owners see the directory read-only, as today.
   - *Acceptance:* grant pharmacy to Latha → her next navigation shows Pharmacy nav + pharmacy home section and dispensing succeeds; revoke → gone and dispensing refused. Revision + audit rows verified in Postgres. All verified live via the role switcher.

### P0-D — Edge-case guards (from the build audit)
8. **Last-owner lockout:** removing `owner` is refused when no *other active* owner would remain — checked inside the transaction, not the UI.
9. **Self-edit:** the owner may edit their own roles, but rule 8 still applies (sole owner cannot demote themself); deactivating yourself is refused outright.
10. **Deactivated signed-in staff:** `getCurrentStaff()` already falls back when the cookie id stops resolving — but its fallback is a hardcoded DEFAULT_STAFF_ID that *throws* if that person is deactivated. Change the final fallback to "any active owner, else any active staff" so deactivating Sameera can't brick every device.
11. **Empty roles:** a staff member must hold ≥1 role; removing the last one is refused (deactivation is the "no access" state).
12. **Mid-session role change:** no invalidation machinery — identity is already resolved per request, so the next navigation reflects it. Document this as the intended behavior; verify with the switcher.

### P1 — ✅ Shipped 2026-07-19
13. `getBookableDoctors` (active staff still holding the doctor role) now feeds reception and the MR walk-in picker; `getDoctors` stays the full list so the queue and display keep showing a deactivated doctor's existing tokens. 3 itests including the role-revoked case.
14. Route→role mapping extracted to `lib/auth/route-roles.ts` — ONE map consumed by both the nav (hides the item) and a new `requireRouteAccess()` guard on all 11 gated pages (redirects to `/home?denied=<screen>` with a warning banner). Verified live: Latha (no pharmacy role) opening /pharmacy by URL lands on home with "The pharmacy screen isn't part of your role."
15. Staff cards show "Last changed by {who} on {date} — {reason}" from the revision trail.

### P2 (unchanged from prior PRD)
16. Per-staff permission overrides beyond roles; real auth invites; discount-limit matrix.

## Build-Audit Findings (fixes folded into phases above)

| # | Finding | Severity | Fixed by |
|---|---------|----------|----------|
| 1 | 9/11 action files hardcode actor ids → audit log lies about who acted | High (integrity) | P0-A |
| 2 | `can()`/`assertCan` fully built + tested, zero callers → roles are cosmetic server-side | High (security-shaped, within prototype trust model) | P0-B |
| 3 | No staff/role management UI or mutations at all | High (the feature ask) | P0-C |
| 4 | `getCurrentStaff` fallback throws if the default staff member is deactivated | Medium | P0-D.10 |
| 5 | No last-owner / empty-roles guards possible today (no mutation) — must ship *with* the mutation, not after | Medium | P0-D.8/9/11 |
| 6 | Doctor-role grant needs a `doctors` row or the person is a doctor with no specialty/queue | Medium | P0-C.5 |

## Verification Bar (house discipline, unchanged)

Every phase: tsc + lint + full unit & DB itest suites green from a clean reset; production build dynamic-route check; live browser verification of the full loop (grant role → switch user → see nav/home change → perform newly-allowed action → verify rows in Postgres; and the refusal path for a role that lacks it). No feature ships demoable only in code review.

## Phasing (for the Opus build passes)

1. **Phase A:** ✅ Shipped 2026-07-19 (`ed68911`). All 9 hardcoded actor ids replaced with `getCurrentStaff()`; fallback now resolves any active owner (else any active staff) instead of one hardcoded id. Verified live: token issued signed-in-as-Latha is audit-logged as Latha.
2. **Phase B:** ✅ Shipped 2026-07-19. `refusalFor()` (pure, in permissions.ts — 5 unit tests incl. every-permission-has-a-message) + `requireCurrentStaffCan()` (lib/auth/guard.ts) wired into all 11 mutating action files, incl. the consult two-level check (consultation:write always, prescription:write when drug lines exist). Verified live both ways: Latha (nurse+front_desk) reaching /pharmacy by URL gets "Latha Bai can't dispense — ask someone with pharmacy access." and writes nothing; Rekha performing the same dispense succeeds with stock movements + audit attributed to Rekha.
3. **Phase C:** ✅ Shipped 2026-07-19. `manage-staff.ts` (updateStaffRoles / addStaff / setStaffActive — 20 itests) with every P0-D guard inside the transactions: last-owner lockout serialized by locking all active staff rows FOR UPDATE (two concurrent owner-demotions cannot both pass the count), self-deactivation refusal, empty-roles refusal, doctor-grant creates the doctors row (specialty from the registry, registrationNo empty so prescribing stays blocked per §9.2) and re-grant reuses the existing row with its registration intact. Settings → Staff gains owner-only Add staff / Edit roles / Deactivate dialogs (reason-required, revision + audit logged). Verified live end-to-end: owner granted Latha the pharmacy role → her next navigation showed pharmacy in roles line, a Pharmacy home section, and Pharmacy+Inventory nav → the exact dispense refused in Phase B's verification now succeeds, attributed to Latha in stock_movements and audit_log; the grant itself is recorded (revision holds prior roles, audit names the owner and the diff).
4. **Phase D (P1, optional):** picker filtering, read redirects, attribution display.

---

*Next step: switch the session model to Opus (`/model claude-opus-4-8`) and begin Phase A.*
