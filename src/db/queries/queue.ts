import "server-only";
import { and, asc, eq, isNull, max, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  doctors,
  patients,
  staff,
  tokens,
  visits,
  vitals,
} from "@/db/schema";

/**
 * Queue reads (§7.2).
 *
 * `server-only` is deliberate: these run with the caller's session and must
 * never be bundled into a client component, where the connection string would
 * follow them.
 *
 * Every query filters on clinicId even though RLS already enforces it. The
 * belt-and-braces is intentional — RLS is the boundary that must hold if this
 * code is wrong, and this filter is what keeps the query planner using the
 * (clinic_id, date) indexes rather than scanning and discarding.
 */

export type QueueEntry = {
  tokenId: string;
  visitId: string;
  number: number;
  state: string;
  isPriority: boolean;
  doctorId: string;
  doctorName: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientSex: string;
  dateOfBirth: string | null;
  ageYears: number | null;
  allergies: string[];
  tags: string[];
  vitals: Record<string, number | string> | null;
  /*
   * Computed here rather than in the component. Calling Date.now() during
   * render makes the component impure — it breaks hydration and concurrent
   * rendering, and React's purity lint rejects it. The server knows the time
   * once, at fetch, which is also the moment the number is actually true.
   */
  waitingMinutes: number;
};

export async function getQueue(
  clinicId: string,
  onDate: string,
): Promise<QueueEntry[]> {
  const now = Date.now();

  const rows = await db
    .select({
      tokenId: tokens.id,
      visitId: tokens.visitId,
      number: tokens.number,
      state: tokens.state,
      isPriority: tokens.isPriority,
      createdAt: tokens.createdAt,
      doctorId: doctors.id,
      doctorName: staff.name,
      patientId: patients.id,
      patientName: patients.name,
      patientPhone: patients.phone,
      patientSex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      ageYears: patients.ageYears,
      allergies: patients.allergies,
      tags: patients.tags,
      vitalsValues: vitals.values,
    })
    .from(tokens)
    .innerJoin(visits, eq(visits.id, tokens.visitId))
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .innerJoin(doctors, eq(doctors.id, tokens.doctorId))
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    /* Left join: a token that has not reached the nurse yet has no vitals
       row, and must still appear in the queue. */
    .leftJoin(vitals, eq(vitals.visitId, tokens.visitId))
    .where(
      and(
        eq(tokens.clinicId, clinicId),
        eq(tokens.tokenDate, onDate),
        ne(tokens.state, "closed"),
        isNull(tokens.archivedAt),
      ),
    )
    /* Priority first, then token order — mirrors what the screen renders so
       the sort is not re-done in the component. */
    .orderBy(asc(tokens.isPriority), asc(tokens.number));

  return rows
    .map((row) => ({
      tokenId: row.tokenId,
      visitId: row.visitId,
      number: row.number,
      state: row.state,
      isPriority: row.isPriority,
      doctorId: row.doctorId,
      doctorName: row.doctorName,
      patientId: row.patientId,
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      patientSex: row.patientSex,
      dateOfBirth: row.dateOfBirth,
      ageYears: row.ageYears,
      allergies: row.allergies ?? [],
      tags: row.tags ?? [],
      vitals: row.vitalsValues ?? null,
      waitingMinutes: Math.max(
        0,
        Math.round((now - new Date(row.createdAt).getTime()) / 60_000),
      ),
    }))
    .sort((a, b) => {
      /* Postgres sorts false before true; priority must lead. */
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      return a.number - b.number;
    });
}

export async function getDoctors(clinicId: string) {
  return db
    .select({
      id: doctors.id,
      name: staff.name,
      specialty: doctors.specialty,
      registrationNo: doctors.registrationNo,
      qualification: staff.qualification,
    })
    .from(doctors)
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    .where(and(eq(doctors.clinicId, clinicId), isNull(doctors.archivedAt)))
    .orderBy(asc(staff.name));
}

/**
 * Next token number for a doctor today.
 *
 * Sequences are per doctor per day (§7.2), and there is a unique index on
 * (doctor_id, token_date, number) — so a race between two front-desk tablets
 * issuing at once fails loudly on insert rather than silently duplicating a
 * number. The caller retries.
 */
export async function getNextTokenNumber(
  clinicId: string,
  doctorId: string,
  onDate: string,
): Promise<number> {
  /*
   * max() rather than order-by-limit-1: it reads as what it is, and it counts
   * archived tokens too. Skipping an archived number would let a cancelled
   * token's number be reissued the same day, so two patients would hear the
   * same number called.
   */
  const [row] = await db
    .select({ highest: max(tokens.number) })
    .from(tokens)
    .where(
      and(
        eq(tokens.clinicId, clinicId),
        eq(tokens.doctorId, doctorId),
        eq(tokens.tokenDate, onDate),
      ),
    );

  return (row?.highest ?? 0) + 1;
}
