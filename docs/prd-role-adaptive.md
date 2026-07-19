# PRD — Role-Adaptive ClinicOS

**Status:** Draft for build · **Author:** Fable 5 planning pass · **Date:** 2026-07-19
**Builds on:** the base ClinicOS PRD (§6 "no code forks per specialty", §7.8 role model, §7.12 onboarding). Implementation happens on the existing prototype: real local Postgres, Drizzle, integration tests, no fabricated data.

---

## Problem Statement

The prototype currently shows every screen to an anonymous user: the nav renders all twelve destinations, `/dashboard` is an owner-view revenue report regardless of who is looking, and the clinical surfaces are hard-coded pediatric (growth curves, vaccination schedule). A receptionist, a nurse, and the owner all land on the same UI and none of it reflects *their* working day. Meanwhile a clinic whose doctor is a dermatologist or a diabetologist gets pediatric vitals fields and a vaccines tab they will never use — which reads as "this product is not for me" in the first thirty seconds of a demo.

Past records are also immutable in the UI: a typo'd diagnosis or a wrong DOB can never be corrected, which no real clinic would accept — but naive editing of medical records is a medico-legal hazard, so corrections must be versioned and audited, never destructive.

## Goals

1. **Every role sees its own day.** Logging in (prototype: switching role) as owner / doctor / front desk / nurse / pharmacy lands on a home screen listing that role's actual work items, drawn from real DB state — and the nav shrinks to that role's destinations.
2. **Every specialty sees its own clinic.** A clinic configured as dermatology shows dermatology vitals fields, consult favourites, and modules; pediatrics keeps growth + vaccines. Zero conditional code paths per specialty — differences resolve from a template-pack data structure (`doctors.templatePack` + a specialty registry).
3. **History is correctable, never rewritable.** Demographics and past consultations can be edited with a mandatory reason; the prior version is preserved, the audit log records actor + reason, and the timeline shows a visible "corrected" marker.
4. **All of it is demoable and tested** against real Postgres: role switching, pack resolution, and edit-versioning each carry integration tests, and every new surface renders seeded (not fabricated) data.

## Non-Goals

- **Real authentication / Supabase Auth.** Stays out of scope as previously decided. The role switcher is an explicit prototype device (cookie-backed), designed so real auth later replaces its *source* (session claims instead of cookie) without touching consumers.
- **Granular permission matrices** (per-action ACLs, discount limits by role). The role model gates *navigation and home screens* in this phase; server-side enforcement beyond what exists ships with real auth.
- **New clinical modules per specialty** (ANC tracker, dental charting, audiometry). Packs select from *existing* building blocks (vitals fields, favourites, procedures, module visibility). Novel specialty modules are their own PRDs.
- **Editing dispensed prescriptions, bills, or stock movements.** Money and drug movements stay append-only, period. Corrections there are void-and-reissue flows, out of scope here.
- **File uploads.** Unchanged from before: needs Supabase Storage.

## User Stories

**Role dashboards**
- As the **owner**, I want to open the app to today's revenue, patients seen, stock alerts, and failed messages so that I can read the clinic's pulse before my first consult.
- As a **doctor**, I want my home screen to show my queue, who is in the room now, my follow-ups due today, and reps waiting for me so that I never navigate to find my own work.
- As **front desk**, I want arrivals-waiting, tokens issued, and WhatsApp failures needing a phone call so that my screen mirrors the counter.
- As a **nurse**, I want vitals pending, procedure tasks due, and the vaccination chase list so that my morning is a checklist, not a hunt.
- As **pharmacy**, I want the dispense queue, expiring batches, and low-stock items so that stock problems surface before a patient is waiting.
- As a staff member with **stacked roles** (front desk + pharmacy), I want both roles' items on one home screen so that role stacking is not punished with tab-switching.

**Specialty adaptation**
- As a **dermatologist**, I want vitals capture to ask for my fields and not head circumference so that data entry matches my exam.
- As a **diabetologist**, I want RBS/FBS in vitals and a blood-sugar trend on the patient record so that trends reflect what I treat.
- As a **pediatrician**, I want growth curves and vaccination schedules to keep working exactly as they do today.
- As the **owner during onboarding**, I want choosing a specialty to preconfigure all of this so that setup is one decision, not fifty.
- As a doctor in a **mixed-specialty clinic**, I want the consult and vitals screens to follow *the treating doctor's* pack, not a global setting.

**History editing**
- As **front desk**, I want to correct a patient's phone/DOB/name with a reason so that records converge on the truth.
- As a **doctor**, I want to amend my own past consultation's diagnosis/advice with a reason so that a dictation error does not persist forever.
- As the **owner**, I want every correction visible in the audit trail (who, when, why, what changed) so that the record stands up to scrutiny.
- As any user, I want the timeline to mark corrected entries so that nobody mistakes an amended record for an original.

## Requirements

### P0 — Role-based experience
1. **Role switcher (prototype auth):** a "Signed in as" control (Settings + first-run) listing seeded staff; selection persists in a cookie and is read server-side. Swappable for real session claims later — single resolution point (`getCurrentStaff()`).
2. **Role-filtered nav:** each nav item declares its roles; the rail/bottom-bar render only the union of the current staff's roles. Owner sees everything.
3. **Role home screens:** `/` (or `/home`) renders per-role dashboard sections from real queries (reuse existing dashboard/queue/tasks/pharmacy queries; add only what's missing, e.g. "my follow-ups today"). Stacked roles concatenate sections, deduplicated.
   - *Acceptance:* switching role changes nav + home within one navigation; every number on each home screen traces to a DB row; integration tests cover section queries; no role sees another role's home sections (owner excepted).

### P0 — Specialty template packs
4. **Specialty registry** (`src/lib/clinical/specialties.ts`): data-only definitions for at least: general practice, pediatrics, gynecology, dermatology, diabetology/internal medicine, orthopedics. Each pack: vitals field set (key, label, unit, input kind, sane-range), consult favourite prescriptions, procedure templates, enabled modules (e.g. `vaccinations`, `growthTrends`), default follow-up interval.
5. **Pack resolution:** effective pack = registry defaults for `doctors.specialty`, deep-merged with per-doctor `templatePack` overrides. One resolver, used by vitals, consult, patient trends, and nav module visibility. Treating doctor's pack wins on clinical screens; clinic `primarySpecialty` only seeds onboarding.
6. **Adaptive surfaces:** vitals capture fields, consult favourites, patient-record trend panels (growth for peds, sugar for diabetology, generic weight/BP otherwise), and module visibility (Vaccines tab hidden when no doctor's pack enables it) all read the resolver.
   - *Acceptance:* seeding a dermatology doctor changes vitals fields + hides vaccines without any code change; pediatric clinic is pixel-identical to today; unit tests on the resolver, integration test on an adapted screen; grep-level check: no `if (specialty === …)` outside the registry/resolver.

### P0 — Audited history editing
7. **Demographics editing:** edit name/DOB/sex/phone/allergies/chronic tags from the patient record. Mandatory reason. Writes: update + `audit_log` row (actor, action `patient_corrected`, diff detail) + prior values preserved in a `record_revisions` table (entity table/id, old values jsonb, reason, actor).
8. **Consultation amendment:** the authoring doctor (or owner) may amend diagnosis/advice/follow-up of a past consultation. Same revision + audit mechanics. Timeline entry shows "Amended" with tap-through to original text and reason.
9. **Hard walls:** bills, payments, stock movements, dispense records, H1 register are not editable via any of this. Vitals editable only same-day by the recorder (P1 if it slips).
   - *Acceptance:* every edit produces exactly one revision row + one audit row atomically (transaction); revision history renders on the record; editing without a reason is rejected server-side; integration tests cover the block-list (attempting to edit a billed consultation's *bill* fails).

### P1
10. Nurse same-day vitals correction (with revision trail).
11. "My day" summary strip for doctors on `/queue` (avg consult time, seen/remaining).
12. Role-aware Display board variants (pharmacy pickup vs token board).

### P2 (architectural insurance only)
13. Real Supabase Auth replacing the cookie switcher at `getCurrentStaff()`.
14. Per-action permission matrix (discount limits, register access) enforced in mutations.
15. Additional specialty packs (ENT, ophthalmology, dental) — pure registry additions by design.

## Success Metrics (prototype)

- **Demo completeness:** every role reachable in ≤2 taps from Settings; each shows a distinct, real-data home. (Verify in browser against psql ground truth, per house rules.)
- **Adaptation proof:** one seeded non-pediatric doctor demonstrably flips vitals fields + module visibility; pediatric flow unchanged (existing 372 tests stay green).
- **Integrity proof:** revision + audit rows for 100% of edits in integration tests; zero editable paths into billing/stock tables.
- **No-fork rule:** zero specialty conditionals outside the registry/resolver (reviewed at code-review time).

## Open Questions

- **(Product, non-blocking)** Should the doctor home show revenue for their own consults? Owner-only for now; revisit with permissions matrix.
- **(Design, non-blocking)** Amended timeline entries: inline strikethrough vs. tap-through to history. Start with tap-through (calmer), adjust after seeing it.
- **(Engineering, resolve during build)** `record_revisions` as one generic table vs. per-entity tables. Recommendation: one generic table (entity_table + entity_id + jsonb), matching `audit_log`'s shape.

## Phasing / Build Order (for the Opus build passes)

1. **Phase A — Identity + role homes.** ✅ Shipped 2026-07-19. `getCurrentStaff()` is the single resolution point (cookie set by the real PIN-unlock flow at `/login`, which now reads seeded staff instead of mock data); nav is role-filtered (verified live for owner+doctor, stacked front_desk+pharmacy, and a pure doctor); `/home` renders per-role sections from real queries with stacked roles concatenating; Settings shows "signed in as" + a switch link. New: `resolveStaffIdentity` + itests, `getDoctorFollowUpsToday` + itests, one seed fix (a follow-up landing on TODAY — otherwise that section would always render empty, same starved-data class as the earlier Trends/Files fixes).
2. **Phase B — Specialty packs.** ✅ Shipped 2026-07-19. Discovered mid-phase that `/vitals/[patientId]` and `/consult/[patientId]` — the two most central clinical screens — were still pure mock-data UI shells with zero database writes, and no mutation anywhere advanced a token past "waiting". Specialty-adaptive fields would have been adapting screens that saved nothing, so both were rewired end-to-end alongside the registry:
   - `src/lib/clinical/specialties.ts` — the registry + one resolver (`resolveSpecialtyPack`), covering pediatrics/general_medicine/gynecology/dermatology/diabetology/orthopedics, with a fallback pack for anything unregistered. Doctor `templatePack` overrides layer on top. 8 unit tests.
   - `/vitals/[patientId]` rewired: real patient/visit/token context (`getVitalsCaptureContext`), a real `recordVitals` mutation (waiting → vitals_done, skip-tracking, audit log). Field set + growth-trend visibility come from the resolver. 10 itests.
   - `/consult/[patientId]` rewired: real context (`getConsultContext`, including the treating doctor's specialty and any vitals already recorded), a real `recordConsultation` mutation (diagnosis required, prescription optional — a doctor with no prescribing registration can still close a visit; with_doctor → at_pharmacy always, prescription or not). Diagnosis favourites come from the resolver. Added advice + follow-up-date fields the old mock UI never had, even though `consultations.advice`/`followUpDate` already existed and the patient timeline already rendered them. 13 itests.
   - Queue board gained its first two real state-transition entry points ("Record vitals" on waiting rows, "Open consultation" now carrying a real visitId) — previously the queue was 100% read-only past token issuance.
   - Verified live end-to-end for both screens: recorded vitals for a general_medicine patient (correct BP/Pulse/Temp/SpO₂/Weight fields, no growth note), then ran a full pediatric consult (diagnosis, advice, a plain prescription line, and an allergy-override line with its reason) and confirmed in Postgres that the token advanced, the consultation/prescription/items wrote correctly, the audit log recorded the actual signed-in actor separately from the treating doctor on the visit, and the patient's timeline picked up the new entry immediately.
3. **Phase C — Audited editing.** ✅ Shipped 2026-07-19.
   - `record_revisions` — a new table (migration `0004`), plus a hand-written follow-up RLS migration (`0005`) giving it tenant isolation and the same append-only/no-delete guarantee already given to `audit_log` (a revision that could itself be edited would defeat the whole point of keeping one). Not auto-generated by drizzle-kit — this project hand-writes RLS, so a new table always needs its own policy migration.
   - `updatePatientDemographics` — name/phone/DOB/allergies/tags, mandatory reason, diffs against the *current* row (not the caller's assumption of it) so only genuinely changed fields land in the revision. 6 itests.
   - `amendConsultation` — diagnosis/advice/follow-up-date, mandatory reason, and a real server-side permission check: only the treating doctor (matched by `doctors.staffId`, not `doctors.id`) or the owner may amend — everyone else is refused before the write, not just hidden in the UI. 8 itests.
   - `getRecordRevisions` + an `amended` boolean added to `getPatientTimeline` (via an EXISTS subquery) so the timeline can show "Amended" without a second round trip. 3 + 3 itests (including one proving the flag actually flips after a real amendment, not just a schema check).
   - UI: a "Correct details" dialog on the patient record header, and an "Amend this entry" link per timeline entry that only *appears* when `canAmend()` is true client-side (mirroring the server check) — a doctor viewing another doctor's patient sees no amend affordance at all, not a button that then fails.
   - Hard walls: no edit path was added anywhere for bills, payments, stock movements, dispense records, or the H1 register — they remain append-only exactly as before; this phase touched only `patients` and `consultations`.
   - Verified live end-to-end: corrected a patient's phone as a non-owner, non-treating-doctor actor (demographics editing has no author restriction, as scoped) and confirmed the revision + audit rows; then signed in as the treating doctor and amended a past diagnosis, confirmed the timeline immediately showed "Amended" with the correct original value, reason, editor, and date, and confirmed the same in Postgres.

All three phases of this PRD are now shipped. 431 tests passing, clean build, clean reset.

Each phase lands with: tsc + lint + unit + db itests green from clean reset, production build dynamic-route check, and in-browser verification against psql ground truth. Seeds must make every new surface demonstrable (no starved-data features — see the empty-table audit from 2026-07-19).

---

*Next step: switch the session model to Opus (`/model claude-opus-4-8`) and begin Phase A.*
