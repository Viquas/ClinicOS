import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { patients, tokens, visits } from "@/db/schema";

/**
 * The visit the billing screen should open on: the earliest token that has
 * been through the doctor (and pharmacy) but is not yet billed.
 *
 * Billing happens after dispensing, so the states that can carry a bill are
 * at_pharmacy and billed — a patient still waiting or with the doctor has
 * nothing to pay for yet.
 */
export async function getBillableVisit(
  clinicId: string,
  onDate: string,
  tx: Executor = db,
): Promise<{
  visitId: string;
  tokenNumber: number;
  patientName: string;
} | null> {
  const [row] = await tx
    .select({
      visitId: visits.id,
      tokenNumber: tokens.number,
      patientName: patients.name,
    })
    .from(tokens)
    .innerJoin(visits, eq(visits.id, tokens.visitId))
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .where(
      and(
        eq(tokens.clinicId, clinicId),
        eq(tokens.tokenDate, onDate),
        inArray(tokens.state, ["at_pharmacy", "billed"]),
        isNull(tokens.archivedAt),
      ),
    )
    .orderBy(asc(tokens.number))
    .limit(1);

  return row ?? null;
}
