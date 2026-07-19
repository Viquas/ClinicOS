import "server-only";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, patients, tokens, visits, waMessages } from "@/db/schema";

/**
 * Register-and-issue (§7.2, §3 goal 1: walk-in to token in under 60 seconds).
 *
 * The interesting part is the token number. Sequences are per doctor per day
 * and there is a unique index on (doctor_id, token_date, number), so two
 * front-desk tablets issuing at the same moment will collide rather than
 * silently hand two patients the same number.
 *
 * That collision is a feature — it is the database refusing to produce a
 * duplicate — but it must not surface to the operator. So this retries on the
 * unique violation, re-reading the maximum each time. Retrying is correct
 * here because the work is idempotent from the caller's point of view: they
 * asked for "the next number", not for a specific one.
 */

const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

export type IssueResult =
  | { ok: true; tokenId: string; visitId: string; number: number }
  | { ok: false; error: string };

/**
 * Drizzle wraps driver errors in a DrizzleQueryError, so the Postgres SQLSTATE
 * lands on `error.cause.code` rather than `error.code`. Checking only the top
 * level silently never matches — the retry below then never fires, and two
 * tablets issuing at once produce a hard failure instead of the next number.
 *
 * Both levels are checked so this keeps working if the wrapping changes.
 */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown): string | undefined =>
    typeof value === "object" && value !== null && "code" in value
      ? (value as { code?: string }).code
      : undefined;

  if (codeOf(error) === UNIQUE_VIOLATION) return true;

  const cause = (error as { cause?: unknown } | null)?.cause;
  return codeOf(cause) === UNIQUE_VIOLATION;
}

export async function issueToken({
  clinicId,
  patientId,
  doctorId,
  onDate,
  isPriority = false,
  actorStaffId,
}: {
  clinicId: string;
  patientId: string;
  doctorId: string;
  onDate: string;
  isPriority?: boolean;
  actorStaffId: string | null;
}): Promise<IssueResult> {
  const [patient] = await db
    .select({ id: patients.id, name: patients.name, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, patientId)))
    .limit(1);

  if (!patient) return { ok: false, error: "Patient not found" };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ highest: max(tokens.number) })
          .from(tokens)
          .where(
            and(
              eq(tokens.clinicId, clinicId),
              eq(tokens.doctorId, doctorId),
              eq(tokens.tokenDate, onDate),
            ),
          );

        const number = (row?.highest ?? 0) + 1;

        const [visit] = await tx
          .insert(visits)
          .values({ clinicId, patientId, doctorId, visitDate: onDate })
          .returning({ id: visits.id });

        const [token] = await tx
          .insert(tokens)
          .values({
            clinicId,
            visitId: visit.id,
            doctorId,
            tokenDate: onDate,
            number,
            isPriority,
            state: "waiting",
          })
          .returning({ id: tokens.id });

        await tx.insert(auditLog).values({
          clinicId,
          actorStaffId,
          action: "token_issued",
          entityTable: "tokens",
          entityId: token.id,
          detail: { patientName: patient.name, number, isPriority },
        });

        /*
         * Token confirmation on WhatsApp (§7.10 P0). Queued here as a real
         * row, not sent — there is no Meta Cloud API credential wired up in
         * this environment, so actually transmitting would be a lie the
         * Messages screen can't back up. "Queued" is the honest status: a
         * real background worker would pick this row up and attempt delivery.
         */
        await tx.insert(waMessages).values({
          clinicId,
          toPhone: patient.phone,
          templateName: "token_confirmation",
          payload: { patientName: patient.name, tokenNumber: number },
          status: "queued",
        });

        return {
          ok: true as const,
          tokenId: token.id,
          visitId: visit.id,
          number,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_ATTEMPTS) {
        /* Another tablet took this number between the read and the insert.
           Loop and read the maximum again. */
        continue;
      }

      console.error("issueToken failed", error);
      return { ok: false, error: "Could not issue a token — please try again" };
    }
  }

  return { ok: false, error: "Could not issue a token — please try again" };
}

export type RegisterResult =
  | { ok: true; patientId: string }
  | { ok: false; error: string };

/**
 * New patient in five fields (§7.1). Consent is captured at registration and
 * stamped here, because under the DPDP Act the record should not exist
 * without it (§9.1).
 */
export async function registerPatient({
  clinicId,
  name,
  phone,
  sex,
  dateOfBirth,
  ageYears,
  guardianName,
  actorStaffId,
}: {
  clinicId: string;
  name: string;
  phone: string;
  sex: "male" | "female" | "other";
  dateOfBirth?: string | null;
  ageYears?: number | null;
  guardianName?: string | null;
  actorStaffId: string | null;
}): Promise<RegisterResult> {
  const trimmedName = name.trim();
  const digits = phone.replace(/\D/g, "");

  if (trimmedName.length < 2) {
    return { ok: false, error: "Enter the patient's name" };
  }
  if (digits.length !== 10) {
    return { ok: false, error: "Enter a 10-digit phone number" };
  }
  if (!dateOfBirth && ageYears == null) {
    /* One or the other is required — rural patients often know the year but
       not the date (§7.1), and a record with neither cannot be dosed. */
    return { ok: false, error: "Enter a date of birth or an age" };
  }

  try {
    const [row] = await db
      .insert(patients)
      .values({
        clinicId,
        name: trimmedName,
        phone: digits,
        sex,
        dateOfBirth: dateOfBirth ?? null,
        ageYears: ageYears ?? null,
        guardianName: guardianName?.trim() || null,
        consentGivenAt: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: patients.id });

    await db.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "patient_registered",
      entityTable: "patients",
      entityId: row.id,
      detail: { name: trimmedName, phone: digits },
    });

    return { ok: true, patientId: row.id };
  } catch (error) {
    console.error("registerPatient failed", error);
    return { ok: false, error: "Could not register the patient" };
  }
}
