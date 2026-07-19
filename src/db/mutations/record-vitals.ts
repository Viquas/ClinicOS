import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, tokens, vitals } from "@/db/schema";

export type RecordVitalsResult = { ok: true } | { ok: false; error: string };

/**
 * Vitals capture's write side (§7.3). A skipped measurement is recorded as a
 * deliberate act (§8.3 rule 3), never as a silent gap, so `skipped` is stored
 * alongside `values` rather than inferred from an absent key.
 *
 * Guards the token is still "waiting" — a double-submit from a slow network
 * or a second tab must not silently duplicate the vitals row or bounce a
 * consult back to "vitals_done" after the doctor has already started.
 */
export async function recordVitals({
  clinicId,
  visitId,
  tokenId,
  actorStaffId,
  values,
  skipped,
}: {
  clinicId: string;
  visitId: string;
  tokenId: string;
  actorStaffId: string | null;
  values: Record<string, number | string>;
  skipped: string[];
}): Promise<RecordVitalsResult> {
  if (Object.keys(values).length === 0 && skipped.length === 0) {
    return { ok: false, error: "Record or skip at least one measurement" };
  }

  return db.transaction(async (tx) => {
    const result = await tx
      .update(tokens)
      .set({ state: "vitals_done", updatedAt: new Date() })
      .where(
        and(
          eq(tokens.clinicId, clinicId),
          eq(tokens.id, tokenId),
          eq(tokens.state, "waiting"),
        ),
      )
      .returning({ id: tokens.id });

    if (result.length === 0) {
      return { ok: false as const, error: "This token is no longer waiting for vitals" };
    }

    await tx.insert(vitals).values({
      clinicId,
      visitId,
      recordedByStaffId: actorStaffId,
      values,
      skipped,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "vitals_recorded",
      entityTable: "vitals",
      entityId: visitId,
    });

    return { ok: true as const };
  });
}
