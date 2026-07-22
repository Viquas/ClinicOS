# Clinic-Software Checklist Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining gaps against the clinic-software best-practice checklist: verifiable prescriptions (Rx ID + QR), an explicit sign ceremony, device capture on signing, and share logging — then sequence the larger workstreams (real auth, PDF, interactions, consent/DPDP) as their own plans.

**Architecture:** Phase 0 (this plan's tasks) rides entirely on infrastructure that already exists — the `/print` pages, the `wa_messages` table, the `audit_log` jsonb detail column — so it needs one new dependency (`qrcode`) and zero migrations. Phases 1–4 are separate subsystems and get separate plans; they are scoped at the end of this document.

**Tech Stack:** Next.js 16 (modified — check `node_modules/next/dist/docs/` before unfamiliar APIs), Drizzle + local Postgres :55440, Vitest (`pnpm test` unit / `pnpm test:db` integration), Tailwind 4 tokens.

## Global Constraints

- Red is only ever clinical urgency — never buttons, brand, or decoration. Green carries primary actions.
- Touch targets ≥ 44px (`--touch-min: 48px` preferred).
- Every mutation writes `audit_log` with the real actor; clinical/money records are append-only.
- Dates are the clinic's day: `clinicToday()` (Asia/Kolkata), never raw `new Date()` date math.
- Package manager is `pnpm`. `npx tsc --noEmit`, `npx eslint <changed files>`, and both vitest suites must stay green after every task.
- Standalone scripts load env via `dotenv/config` which reads `.env` only — run DB scripts with `DATABASE_URL` exported or rely on the app (which reads `.env.local`).
- Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Phase 0 — verifiable prescriptions & signing trail (THIS PLAN)

### Task 1: Rx display-code helper

**Files:**
- Create: `src/lib/rx-code.ts`
- Test: `src/lib/rx-code.test.ts`

**Interfaces:**
- Produces: `rxDisplayCode(uuid: string): string` — `"1d3c4447-2917-4760-892b-3dc76f9f3ec2"` → `"1D3C-4447"`. Task 3 prints this on the slip.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/rx-code.test.ts
import { describe, expect, it } from "vitest";
import { rxDisplayCode } from "./rx-code";

describe("rxDisplayCode", () => {
  it("formats the first 8 hex chars as XXXX-XXXX", () => {
    expect(rxDisplayCode("1d3c4447-2917-4760-892b-3dc76f9f3ec2")).toBe(
      "1D3C-4447",
    );
  });

  it("ignores dashes in the input", () => {
    expect(rxDisplayCode("a6efea0c41364b70ae3101a4b8935fa4")).toBe("A6EF-EA0C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rx-code.test.ts`
Expected: FAIL — `Cannot find module './rx-code'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/rx-code.ts
/**
 * Human-readable prescription code (§9.2 verification).
 *
 * The full UUID is what the QR encodes and what the record stores; this is
 * the short form a pharmacist reads over the phone or matches by eye. Eight
 * hex chars ≈ 4 billion combinations — collision within one clinic's
 * lifetime of prescriptions is not a practical concern, and the QR carries
 * the full id for exact verification.
 */
export function rxDisplayCode(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rx-code.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rx-code.ts src/lib/rx-code.test.ts
git commit -m "Add the short Rx display-code helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Expose the prescription id from the print query

**Files:**
- Modify: `src/db/queries/prescription-print.ts` (type at ~line 25, return at ~line 170)
- Test: create `src/db/queries/prescription-print.itest.ts`

**Interfaces:**
- Consumes: existing `getPrescriptionPrintData(clinicId, visitId, tx)`.
- Produces: `PrescriptionPrintData` gains `prescriptionId: string | null` (null for advice-only visits). Task 3 reads it.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/db/queries/prescription-print.itest.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  consultations,
  prescriptionItems,
  prescriptions,
  visits,
} from "@/db/schema";
import { clinicToday } from "@/lib/clinic-date";
import { getPrescriptionPrintData } from "./prescription-print";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DOCTOR = "33333333-0000-0000-0000-000000000001";

let visitId: string;
let rxId: string;

async function cleanup() {
  if (rxId) {
    await db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rxId));
    await db.delete(prescriptions).where(eq(prescriptions.id, rxId));
  }
  if (visitId) {
    await db.delete(consultations).where(eq(consultations.visitId, visitId));
    await db.delete(visits).where(eq(visits.id, visitId));
  }
}

beforeEach(async () => {
  const [visit] = await db
    .insert(visits)
    .values({ clinicId: CLINIC, patientId: AARAV, doctorId: DOCTOR, visitDate: clinicToday() })
    .returning({ id: visits.id });
  visitId = visit.id;

  await db.insert(consultations).values({
    clinicId: CLINIC,
    visitId,
    doctorId: DOCTOR,
    diagnosis: "URTI",
  });

  const [rx] = await db
    .insert(prescriptions)
    .values({
      clinicId: CLINIC,
      visitId,
      doctorId: DOCTOR,
      issuedSnapshot: { doctorId: DOCTOR },
      signedAt: new Date(),
    })
    .returning({ id: prescriptions.id });
  rxId = rx.id;

  await db.insert(prescriptionItems).values({
    clinicId: CLINIC,
    prescriptionId: rxId,
    drugName: "Paracetamol Syrup",
    dosage: "1-0-1",
    scheduleClass: "none",
  });
});

afterEach(cleanup);

describe("getPrescriptionPrintData", () => {
  it("returns the prescription id alongside the lines", async () => {
    const data = await getPrescriptionPrintData(CLINIC, visitId);
    expect(data).not.toBeNull();
    expect(data!.prescriptionId).toBe(rxId);
    expect(data!.lines).toHaveLength(1);
  });

  it("returns null prescriptionId for an advice-only visit", async () => {
    await db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rxId));
    await db.delete(prescriptions).where(eq(prescriptions.id, rxId));
    rxId = "";
    const data = await getPrescriptionPrintData(CLINIC, visitId);
    expect(data!.prescriptionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.db.config.ts src/db/queries/prescription-print.itest.ts`
Expected: FAIL — `prescriptionId` does not exist on the returned type / is `undefined`

- [ ] **Step 3: Implement**

In `src/db/queries/prescription-print.ts`, add to the `PrescriptionPrintData` type (after the `visit` block):

```ts
  /** Null for an advice-only visit — the slip then carries no QR/Rx-ID. */
  prescriptionId: string | null;
```

The query already selects the prescription row (`const [prescription] = await tx.select({ id: prescriptions.id })…`). In the final `return`, add:

```ts
    prescriptionId: prescription?.id ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.db.config.ts src/db/queries/prescription-print.itest.ts`
Expected: PASS (2 tests). Also run `npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/prescription-print.ts src/db/queries/prescription-print.itest.ts
git commit -m "Expose the prescription id from the print query

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: QR code + Rx ID on the printed prescription

**Files:**
- Modify: `package.json` (add `qrcode`, dev `@types/qrcode`)
- Modify: `src/app/print/rx/[visitId]/page.tsx` (footer block, ~line 210)

**Interfaces:**
- Consumes: `data.prescriptionId` (Task 2), `rxDisplayCode` (Task 1).
- Produces: printed slip shows a scannable QR encoding `clinicos:rx:<uuid>` plus `Rx ID XXXX-XXXX`. (Phase 2 upgrades the payload to a verification URL once a domain exists.)

- [ ] **Step 1: Add the dependency**

```bash
pnpm add qrcode && pnpm add -D @types/qrcode
```

- [ ] **Step 2: Generate the QR server-side**

In `src/app/print/rx/[visitId]/page.tsx`, add imports:

```ts
import QRCode from "qrcode";
import { rxDisplayCode } from "@/lib/rx-code";
```

In the page component, after `if (!data) notFound();`:

```ts
  /*
   * The QR carries the full prescription UUID so a pharmacy can verify a
   * slip against the record exactly; the printed short code is the
   * human-readable form of the same id. Generated server-side as SVG —
   * no client JS on a page that exists to be printed.
   */
  const qrSvg = data.prescriptionId
    ? await QRCode.toString(`clinicos:rx:${data.prescriptionId}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      })
    : null;
```

- [ ] **Step 3: Render it in the signature footer**

Replace the existing `<footer>` block (the one containing `Clinic Reg.` and the signature line) with:

```tsx
          <footer className="mt-12 flex items-end justify-between gap-6">
            <div className="flex items-end gap-3">
              {qrSvg && data.prescriptionId ? (
                <>
                  {/* Safe: qrSvg is generated by us from a UUID we issued —
                      no user-controlled input reaches this markup. */}
                  <div
                    className="h-[72px] w-[72px] shrink-0"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-[#5b7286]">
                      Rx ID {rxDisplayCode(data.prescriptionId)}
                    </p>
                    <p className="text-[11px] text-[#8ba6b8]">
                      {clinic.ceaRegistrationNo
                        ? `Clinic Reg. ${clinic.ceaRegistrationNo} · `
                        : ""}
                      Generated by ClinicOS
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-[#8ba6b8]">
                  {clinic.ceaRegistrationNo
                    ? `Clinic Reg. ${clinic.ceaRegistrationNo} · `
                    : ""}
                  Generated by ClinicOS
                </p>
              )}
            </div>
            <div className="text-center">
              <div className="mb-1 w-52 border-t border-[#5b7286]" />
              <p className="text-[13px] font-semibold">{doctor.name}</p>
              {doctor.registrationNo ? (
                <p className="text-[11px] text-[#5b7286]">
                  Reg. {doctor.registrationNo}
                </p>
              ) : null}
            </div>
          </footer>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expect clean.
Get a live visit id: `psql "postgresql://postgres@127.0.0.1:55440/clinicos_dev" -t -A -c "select visit_id from prescriptions limit 1;"`
Open `http://localhost:3000/print/rx/<visitId>` in the Browser pane; screenshot. Expected: QR bottom-left with `Rx ID` beside it, signature block unchanged on the right.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml "src/app/print/rx/[visitId]/page.tsx"
git commit -m "Print a QR and short Rx ID on the prescription slip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Capture device (IP + user-agent) when a consultation is signed

**Files:**
- Create: `src/lib/audit/request-device.ts`
- Modify: `src/app/consult/[patientId]/actions.ts` (~line 45, the `recordConsultation` call)
- Modify: `src/db/mutations/record-consultation.ts` (params ~line 42, audit insert ~line 134)
- Test: append to `src/db/mutations/record-consultation.itest.ts`

**Interfaces:**
- Produces: `getRequestDevice(): Promise<{ ip: string | null; userAgent: string | null }>`; `recordConsultation` gains optional `device?: { ip: string | null; userAgent: string | null }` merged into the audit `detail` jsonb. No schema migration.

- [ ] **Step 1: Write the failing integration test**

Append to `src/db/mutations/record-consultation.itest.ts` (it already defines `CLINIC`; reuse its fixture constants if present, otherwise use these ids which exist in the seed):

```ts
describe("device capture", () => {
  const DCLINIC = "11111111-1111-1111-1111-111111111111";
  const DPATIENT = "44444444-0000-0000-0000-000000000004";
  const DDOCTOR = "33333333-0000-0000-0000-000000000001";
  const DSTAFF = "22222222-0000-0000-0000-000000000003";
  let dVisitId: string;
  let dTokenId: string;

  beforeEach(async () => {
    const [v] = await db
      .insert(visits)
      .values({ clinicId: DCLINIC, patientId: DPATIENT, doctorId: DDOCTOR, visitDate: clinicToday() })
      .returning({ id: visits.id });
    dVisitId = v.id;
    const [t] = await db
      .insert(tokens)
      .values({ clinicId: DCLINIC, visitId: dVisitId, doctorId: DDOCTOR, tokenDate: clinicToday(), number: 97, state: "with_doctor" })
      .returning({ id: tokens.id });
    dTokenId = t.id;
  });

  afterEach(async () => {
    await db.delete(auditLog).where(eq(auditLog.entityId, dVisitId));
    await db.delete(consultations).where(eq(consultations.visitId, dVisitId));
    await db.delete(tokens).where(eq(tokens.id, dTokenId));
    await db.delete(visits).where(eq(visits.id, dVisitId));
  });

  it("stores the signing device in the audit detail when provided", async () => {
    const result = await recordConsultation({
      clinicId: DCLINIC,
      visitId: dVisitId,
      tokenId: dTokenId,
      doctorId: DDOCTOR,
      actorStaffId: DSTAFF,
      diagnosis: "Device-capture test",
      advice: null,
      followUpDate: null,
      lines: [],
      device: { ip: "10.0.0.9", userAgent: "TestTablet/1.0" },
    });
    expect(result.ok).toBe(true);

    const [entry] = await db
      .select({ detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, dVisitId));
    expect(entry.detail).toMatchObject({
      device: { ip: "10.0.0.9", userAgent: "TestTablet/1.0" },
    });
  });
});
```

(Ensure the file's imports include `auditLog`, `consultations`, `tokens`, `visits` from `@/db/schema`, `clinicToday` from `@/lib/clinic-date`, and `beforeEach`/`afterEach` from vitest — merge with existing imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.db.config.ts src/db/mutations/record-consultation.itest.ts`
Expected: FAIL — TS error: `device` is not a known parameter.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/audit/request-device.ts
import "server-only";
import { headers } from "next/headers";

/**
 * The device behind the current request, for the audit trail (§9 —
 * "IP/device, optional but recommended" on anything signed).
 *
 * Best-effort by design: behind the clinic's router every tablet may share
 * one NAT'd IP, and user agents lie — this is corroborating detail for a
 * dispute, never an identity mechanism. That job belongs to real auth
 * (docs/prd-real-auth.md).
 */
export async function getRequestDevice(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent")?.slice(0, 256) ?? null;
  return { ip, userAgent };
}
```

- [ ] **Step 4: Thread it through the mutation**

In `src/db/mutations/record-consultation.ts`, add to the params type and destructuring:

```ts
  /* Best-effort signing-device detail for the audit row (§9). */
  device?: { ip: string | null; userAgent: string | null };
```

and change the audit insert's `detail` to:

```ts
      detail: {
        prescriptionLineCount: lines.length,
        ...(device ? { device } : {}),
      },
```

In `src/app/consult/[patientId]/actions.ts`, add the import and pass it:

```ts
import { getRequestDevice } from "@/lib/audit/request-device";
```

and inside `recordConsultationAction`, before the `tenantDb` call:

```ts
  const device = await getRequestDevice();
```

then add `device,` to the `recordConsultation({ … })` arguments.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --config vitest.db.config.ts src/db/mutations/record-consultation.itest.ts`
Expected: PASS (all, including the new one). Also `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit/request-device.ts src/db/mutations/record-consultation.ts "src/app/consult/[patientId]/actions.ts" src/db/mutations/record-consultation.itest.ts
git commit -m "Record the signing device on every consultation's audit row

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Log WhatsApp shares to the message log

**Files:**
- Create: `src/db/mutations/log-wa-share.ts`
- Create: `src/app/print/actions.ts`
- Modify: `src/app/print/print-actions.tsx` (add optional `share` prop, fire action on click)
- Modify: `src/app/print/rx/[visitId]/page.tsx` and `src/app/print/bill/[visitId]/page.tsx` (pass `share`)
- Modify: `src/app/vaccinations/actions.ts` (add `logReminderShareAction`), `src/app/vaccinations/vaccinations-board.tsx` (call it on reminder click)
- Modify: `src/app/messages/messages-board.tsx` (labels + empty-state copy + `shared` tone)
- Test: create `src/db/mutations/log-wa-share.itest.ts`

**Interfaces:**
- Produces: `logWaShare({ clinicId, toPhone, templateName, patientName, actorStaffId, executor? })` inserting a `wa_messages` row with `status: "shared"`, `payload: { patientName }`. Template names: `prescription_share`, `bill_receipt_share`, `vaccination_reminder_share`.
- `PrintActions` gains `share?: { templateName: string; toPhone: string; patientName: string }`.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/db/mutations/log-wa-share.itest.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { waMessages } from "@/db/schema";
import { logWaShare } from "./log-wa-share";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000003";
let rowId: string;

afterEach(async () => {
  if (rowId) await db.delete(waMessages).where(eq(waMessages.id, rowId));
});

describe("logWaShare", () => {
  it("records a shared message with its template and patient", async () => {
    const result = await logWaShare({
      clinicId: CLINIC,
      toPhone: "9845012233",
      templateName: "prescription_share",
      patientName: "Aarav Prakash",
      actorStaffId: STAFF,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    rowId = result.messageId;

    const [row] = await db
      .select({ status: waMessages.status, payload: waMessages.payload })
      .from(waMessages)
      .where(eq(waMessages.id, result.messageId));
    expect(row.status).toBe("shared");
    expect(row.payload).toMatchObject({ patientName: "Aarav Prakash" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.db.config.ts src/db/mutations/log-wa-share.itest.ts`
Expected: FAIL — `Cannot find module './log-wa-share'`

- [ ] **Step 3: Implement the mutation**

```ts
// src/db/mutations/log-wa-share.ts
import "server-only";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { waMessages } from "@/db/schema";

export type LogWaShareResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Records a wa.me share in the message log (§7.10).
 *
 * "shared" is its own status, distinct from the provider pipeline
 * (queued → sent → delivered): it means a staff member opened WhatsApp on
 * this device with the message prefilled. We cannot know whether they
 * pressed send — the log entry is "it was handed to WhatsApp", which is
 * still worth a line in the day's communication record. Deliberately not
 * counted in the estimated-spend tile, which only counts sent/delivered.
 */
export async function logWaShare({
  clinicId,
  toPhone,
  templateName,
  patientName,
  actorStaffId,
  executor = db,
}: {
  clinicId: string;
  toPhone: string;
  templateName:
    | "prescription_share"
    | "bill_receipt_share"
    | "vaccination_reminder_share";
  patientName: string;
  actorStaffId: string | null;
  executor?: Executor;
}): Promise<LogWaShareResult> {
  try {
    const [row] = await executor
      .insert(waMessages)
      .values({
        clinicId,
        toPhone,
        templateName,
        status: "shared",
        payload: { patientName, sharedByStaffId: actorStaffId },
      })
      .returning({ id: waMessages.id });
    return { ok: true, messageId: row.id };
  } catch (error) {
    console.error("logWaShare failed", error);
    return { ok: false, error: "Could not log the share" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.db.config.ts src/db/mutations/log-wa-share.itest.ts`
Expected: PASS

- [ ] **Step 5: Add the server action**

```ts
// src/app/print/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { logWaShare } from "@/db/mutations/log-wa-share";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getCurrentStaff } from "@/lib/auth/current-staff";

export async function logShareAction(input: {
  templateName:
    | "prescription_share"
    | "bill_receipt_share"
    | "vaccination_reminder_share";
  toPhone: string;
  patientName: string;
}): Promise<void> {
  /* Fire-and-forget from the share button: a failed log line must never
     block the share itself, so errors are swallowed after logging. */
  try {
    const clinicId = await getActiveClinicId();
    const staff = await getCurrentStaff(clinicId);
    await tenantDb((tx) =>
      logWaShare({
        clinicId,
        toPhone: input.toPhone,
        templateName: input.templateName,
        patientName: input.patientName,
        actorStaffId: staff.id,
        executor: tx,
      }),
    );
    revalidatePath("/messages");
  } catch (error) {
    console.error("logShareAction failed", error);
  }
}
```

- [ ] **Step 6: Wire PrintActions**

In `src/app/print/print-actions.tsx`: add the import `import { logShareAction } from "./actions";`, extend props:

```ts
  /** When set, opening WhatsApp also writes a "shared" row to the log. */
  share?: {
    templateName:
      | "prescription_share"
      | "bill_receipt_share"
      | "vaccination_reminder_share";
    toPhone: string;
    patientName: string;
  };
```

and on the WhatsApp `<a>`, add:

```tsx
          onClick={() => {
            if (share) void logShareAction(share);
          }}
```

In `src/app/print/rx/[visitId]/page.tsx` pass:

```tsx
      <PrintActions
        waLink={waLink}
        share={{
          templateName: "prescription_share",
          toPhone: patient.phone,
          patientName: patient.name,
        }}
      />
```

In `src/app/print/bill/[visitId]/page.tsx` pass the same shape with `templateName: "bill_receipt_share"` (keep its existing `waLabel`).

- [ ] **Step 7: Wire the vaccination reminder**

In `src/app/vaccinations/actions.ts`, add (merging imports with what the file already has):

```ts
import { logWaShare } from "@/db/mutations/log-wa-share";
import { getCurrentStaff } from "@/lib/auth/current-staff";

export async function logReminderShareAction(input: {
  toPhone: string;
  patientName: string;
}): Promise<void> {
  try {
    const clinicId = await getActiveClinicId();
    const staff = await getCurrentStaff(clinicId);
    await tenantDb((tx) =>
      logWaShare({
        clinicId,
        toPhone: input.toPhone,
        templateName: "vaccination_reminder_share",
        patientName: input.patientName,
        actorStaffId: staff.id,
        executor: tx,
      }),
    );
  } catch (error) {
    console.error("logReminderShareAction failed", error);
  }
}
```

In `src/app/vaccinations/vaccinations-board.tsx`, import it and extend the reminder link's existing `onClick` (the one that does `setReminded(...)`) to also call:

```ts
                            void logReminderShareAction({
                              toPhone: child.phone,
                              patientName: child.name,
                            });
```

- [ ] **Step 8: Update the messages board**

In `src/app/messages/messages-board.tsx`:
- Replace `TEMPLATE_LABEL` with:

```ts
const TEMPLATE_LABEL: Record<string, string> = {
  token_confirmation: "Token confirmation",
  prescription_share: "Prescription shared",
  bill_receipt_share: "Receipt shared",
  vaccination_reminder_share: "Vaccine reminder shared",
};
```

- Add `shared: "accent"` to the `STATUS_TONE` record.
- Update the empty-state hint to: `"Issuing a token queues its WhatsApp confirmation here automatically. Prescription, receipt, and reminder shares are logged the moment they're opened in WhatsApp."`

- [ ] **Step 9: Verify end-to-end**

Run: `npx tsc --noEmit && npx eslint src/app/print src/app/vaccinations src/app/messages/messages-board.tsx src/db/mutations/log-wa-share.ts` — clean.
In the Browser pane: open a `/print/rx/<visitId>` page, click "Send on WhatsApp" (the wa.me tab may be blocked — fine), then open `/messages`. Expected: a "Prescription shared" row with a `Shared` pill.

- [ ] **Step 10: Commit**

```bash
git add src/db/mutations/log-wa-share.ts src/db/mutations/log-wa-share.itest.ts src/app/print src/app/vaccinations src/app/messages/messages-board.tsx
git commit -m "Log WhatsApp shares to the message log

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Explicit "Finalize & sign" ceremony on the consult

**Files:**
- Modify: `src/app/consult/[patientId]/consult-form.tsx` (save button ~line 400; new dialog state near the other `useState`s; `Dialog`/`DialogTitle` are already imported)

**Interfaces:**
- Consumes: existing `handleSave` and the `saved` handoff screen. No API changes.

- [ ] **Step 1: Add the confirm state and dialog**

Add state beside the others:

```ts
  const [confirmingSign, setConfirmingSign] = useState(false);
```

Change the save button block to:

```tsx
      <div className="mt-7">
        <PrimaryButton
          disabled={!diagnosis.trim() || isPending}
          onClick={() => {
            if (lines.length > 0) setConfirmingSign(true);
            else handleSave();
          }}
        >
          {isPending
            ? "Saving…"
            : lines.length > 0
              ? "Finalize & sign prescription"
              : "Save & send to pharmacy"}
        </PrimaryButton>
      </div>
```

Add the dialog before the component's closing fragment (alongside the allergy-override dialog):

```tsx
      {confirmingSign ? (
        <Dialog onClose={() => setConfirmingSign(false)}>
          <Card className="w-full max-w-md p-6">
            <DialogTitle className="text-[19px] font-bold tracking-[-0.015em] text-ink">
              Sign this prescription?
            </DialogTitle>
            <p className="mt-2 text-[15px] leading-snug text-ink-secondary">
              {diagnosis.trim()} · {lines.length} medicine
              {lines.length > 1 ? "s" : ""}. Signing records it under your
              name and locks it — corrections after this are amendments, never
              edits.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <SecondaryButton onClick={() => setConfirmingSign(false)}>
                Go back
              </SecondaryButton>
              <div className="max-w-[260px] flex-1">
                <PrimaryButton
                  disabled={isPending}
                  onClick={() => {
                    setConfirmingSign(false);
                    handleSave();
                  }}
                >
                  Sign & send to pharmacy
                </PrimaryButton>
              </div>
            </div>
          </Card>
        </Dialog>
      ) : null}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run` — clean/green.
Browser: start a consult from the queue (a `with_doctor` token exists in the seed), add a drug, tap "Finalize & sign prescription". Expected: dialog summarising diagnosis + line count; "Sign & send to pharmacy" completes and lands on the print handoff.

- [ ] **Step 3: Commit**

```bash
git add "src/app/consult/[patientId]/consult-form.tsx"
git commit -m "Make signing a prescription an explicit ceremony

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phases 1–4 — separate subsystems, separate plans

Each of these is an independent subsystem per the scope check. Do **not** fold them into Phase 0's execution; write each its own plan when picked up.

### Phase 1 — Real authentication (highest priority; gates real patient data)
- **Spec already exists:** `docs/prd-real-auth.md` (Supabase phone OTP; session claims replace the cookie inside `getCurrentStaff()`/`getActiveClinicId()`; PIN becomes device-unlock only; RLS is already load-bearing via `withClaims`).
- **Acceptance:** identity comes from a verified session; setting the old cookie by hand grants nothing; all existing tests pass; demo role-switcher survives behind a dev flag.
- **Unblocks:** trustworthy audit rows (Task 4's device detail becomes corroboration for a *verified* actor), consent capture attribution, DPDP obligations.

### Phase 2 — Prescription PDF + real sending
- **Scope:** generate a PDF of the existing print sheet server-side, store at `prescriptions.pdfPath` (column already exists) in Supabase Storage; upgrade the QR payload from `clinicos:rx:<id>` to a public verification URL; send the PDF via a WhatsApp Business provider, upgrading Task 5's `shared` rows to real `queued → sent → delivered` tracking.
- **Blocked on:** Supabase project configuration (only `DATABASE_URL` exists in `.env.local`) and a provider account — both owner decisions.
- **Acceptance:** a pharmacy scanning the QR reaches a page confirming issuer, patient initials, drugs, and date; `wa_messages` reflects true delivery status.

### Phase 3 — Drug interaction checks
- **Scope:** follow the proven allergy-check pattern (`src/lib/clinical/allergy.ts`: pure, exhaustively-tested matcher + hard block + reason-required override stored on the line) with a curated interaction-pair table for the ~50 highest-risk combinations relevant to small-clinic formularies. A licensed comprehensive database (e.g. DrugBank) is a later commercial decision.
- **Acceptance:** prescribing warfarin + an NSAID (or any curated pair) blocks with a named interaction; override requires a reason; reason lands on the prescription line and in the audit row.

### Phase 4 — Consent records + DPDP compliance
- **Scope:** a `consents` table (patient, purpose — e.g. `whatsapp_sharing`, capturedBy, capturedAt, revokedAt); the share buttons check consent for the sharing purpose and offer one-tap capture when absent; a `docs/compliance-dpdp.md` mapping the product to India's DPDP Act (data inventory, purpose limitation, principal rights — the archive-not-delete discipline already aligns with retention norms, document it), plus encryption posture (Supabase at-rest + TLS; no PHI in server logs — audit `console.error` call sites).
- **Acceptance:** sharing without consent prompts capture; consent rows are append-only (revocation is a new row); the compliance doc reviewed by an actual professional before commercial use — a doc we draft, counsel signs off.

---

## Self-review notes

- Checklist coverage: steps 1–7 of the 9-step flow were already shipped or land in Tasks 4/6; step 8 = Task 3 now + Phase 2 (PDF/QR-URL); step 9 = Task 5 now + Phase 2 (real sends). Extras: RBAC/audit/versioning already live; interactions → Phase 3; consent/encryption/compliance → Phase 4; allergy checks already live.
- Type consistency: `prescriptionId: string | null` (Task 2) is what Task 3 reads; `share` prop type in Task 5 matches `logShareAction`'s input and `logWaShare`'s `templateName` union.
- Seed-dependent ids used in tests (`1111…`, `4444…-0004`, `3333…-0001`, `2222…-0003`) all exist in `src/db/seed.ts` and are already used by sibling itests.
