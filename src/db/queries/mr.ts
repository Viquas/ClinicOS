import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { medicalReps, mrCompanies, mrVisits } from "@/db/schema";

/**
 * A visit's clinical date is scheduledFor when a slot was booked, or
 * checkedInAt for a walk-in logged with no prior slot — never createdAt,
 * which is only bookkeeping metadata about when the database row itself was
 * written and has no clinical meaning.
 */
const visitDate = sql`coalesce(${mrVisits.scheduledFor}, ${mrVisits.checkedInAt})`;

/**
 * Medical rep queue (§7.9) — deliberately separate from the patient token
 * sequence. A rep's state is derived from two independent timestamps rather
 * than one enum column: booked (neither set), waiting (checked in, not yet
 * seen), seen (both set) — the front desk acts on the first transition, the
 * doctor on the second, and they must never collide into a single flag.
 *
 * doctorNotes is never selected here — it is private to the doctor (§7.9 P1)
 * and this is the query the front-desk-facing screen reads from.
 */

export type MrRepRow = {
  visitId: string;
  repId: string;
  name: string;
  companyName: string;
  division: string | null;
  phone: string | null;
  doctorId: string;
  state: "booked" | "waiting" | "seen";
  scheduledFor: Date | null;
  checkedInAt: Date | null;
  lastVisit: string | null;
};

export async function getMrQueue(
  clinicId: string,
  dayStart: Date,
  dayEnd: Date,
  tx: Executor = db,
): Promise<MrRepRow[]> {
  const rows = await tx
    .select({
      visitId: mrVisits.id,
      repId: medicalReps.id,
      name: medicalReps.name,
      companyName: mrCompanies.name,
      division: medicalReps.division,
      phone: medicalReps.phone,
      doctorId: mrVisits.doctorId,
      scheduledFor: mrVisits.scheduledFor,
      checkedInAt: mrVisits.checkedInAt,
      seenAt: mrVisits.seenAt,
    })
    .from(mrVisits)
    .innerJoin(medicalReps, eq(medicalReps.id, mrVisits.repId))
    .innerJoin(mrCompanies, eq(mrCompanies.id, medicalReps.companyId))
    .where(
      and(
        eq(mrVisits.clinicId, clinicId),
        isNull(mrVisits.archivedAt),
        /*
         * A raw sql template does not know how to bind a JS Date the way a
         * column-aware helper like gte()/lt() does — it needs an explicit
         * ISO string with a cast, or postgres-js throws on the bind rather
         * than serialising it.
         */
        sql`${visitDate} >= ${dayStart.toISOString()}::timestamptz`,
        sql`${visitDate} < ${dayEnd.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(mrVisits.scheduledFor);

  /* Last visit per rep, excluding today. One query for every candidate rep's
     prior visits, reduced to a max in JS — not a query per row, and not a
     window function, since the roster here is small enough that either
     works and this is the simpler one to verify. */
  const repIds = [...new Set(rows.map((r) => r.repId))];

  const priorVisits = repIds.length
    ? await tx
        .select({ repId: mrVisits.repId, checkedInAt: mrVisits.checkedInAt })
        .from(mrVisits)
        .where(
          and(
            eq(mrVisits.clinicId, clinicId),
            inArray(mrVisits.repId, repIds),
            sql`${visitDate} < ${dayStart.toISOString()}::timestamptz`,
            isNull(mrVisits.archivedAt),
          ),
        )
    : [];

  const lastVisitByRep = new Map<string, Date>();
  for (const visit of priorVisits) {
    if (!visit.checkedInAt) continue;
    const current = lastVisitByRep.get(visit.repId);
    if (!current || visit.checkedInAt > current) {
      lastVisitByRep.set(visit.repId, visit.checkedInAt);
    }
  }

  return rows.map((row) => ({
    visitId: row.visitId,
    repId: row.repId,
    name: row.name,
    companyName: row.companyName,
    division: row.division,
    phone: row.phone,
    doctorId: row.doctorId,
    state: row.seenAt ? "seen" : row.checkedInAt ? "waiting" : "booked",
    scheduledFor: row.scheduledFor,
    checkedInAt: row.checkedInAt,
    lastVisit:
      lastVisitByRep.get(row.repId)?.toISOString().slice(0, 10) ?? null,
  }));
}

/** Every rep in the formulary — used to populate "log a walk-in". */
export async function getRepDirectory(clinicId: string, tx: Executor = db) {
  return tx
    .select({
      id: medicalReps.id,
      name: medicalReps.name,
      companyName: mrCompanies.name,
    })
    .from(medicalReps)
    .innerJoin(mrCompanies, eq(mrCompanies.id, medicalReps.companyId))
    .where(
      and(eq(medicalReps.clinicId, clinicId), isNull(medicalReps.archivedAt)),
    )
    .orderBy(medicalReps.name);
}
