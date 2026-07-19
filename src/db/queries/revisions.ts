import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recordRevisions, staff } from "@/db/schema";

export type RevisionRow = {
  id: string;
  at: Date;
  editedByName: string | null;
  reason: string;
  previousValues: Record<string, unknown>;
};

/**
 * The correction history for one record (§9's editing model) — newest
 * first, so the timeline's "Amended" marker can show what the most recent
 * change was without the reader hunting through the whole history.
 */
export async function getRecordRevisions(
  clinicId: string,
  entityTable: string,
  entityId: string,
): Promise<RevisionRow[]> {
  const rows = await db
    .select({
      id: recordRevisions.id,
      at: recordRevisions.createdAt,
      editedByName: staff.name,
      reason: recordRevisions.reason,
      previousValues: recordRevisions.previousValues,
    })
    .from(recordRevisions)
    .leftJoin(staff, eq(staff.id, recordRevisions.editedByStaffId))
    .where(
      and(
        eq(recordRevisions.clinicId, clinicId),
        eq(recordRevisions.entityTable, entityTable),
        eq(recordRevisions.entityId, entityId),
      ),
    )
    .orderBy(desc(recordRevisions.createdAt));

  return rows.map((r) => ({
    ...r,
    previousValues: (r.previousValues as Record<string, unknown>) ?? {},
  }));
}
