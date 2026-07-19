import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, mrVisits } from "@/db/schema";

/**
 * Medical rep visit lifecycle (§7.9) — booked → waiting → seen.
 *
 * Kept intentionally separate from the patient token mutations: a rep
 * check-in must never touch `tokens` or `visits`, which is the whole point
 * of the module (§7.9's promise that reps cannot delay a waiting patient).
 */

export type MrResult = { ok: true } | { ok: false; error: string };

export async function checkInRep({
  clinicId,
  mrVisitId,
  executor = db,
}: {
  clinicId: string;
  mrVisitId: string;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<MrResult> {
  /* Only a booked (not yet checked-in) visit can be checked in — the WHERE
     clause is the guard, not a check-then-write, so two front-desk taps at
     once cannot both succeed and silently reset the wait timer. */
  const result = await executor
    .update(mrVisits)
    .set({ checkedInAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(mrVisits.clinicId, clinicId),
        eq(mrVisits.id, mrVisitId),
        isNull(mrVisits.checkedInAt),
      ),
    )
    .returning({ id: mrVisits.id });

  if (result.length === 0) {
    return { ok: false, error: "Visit not found or already checked in" };
  }
  return { ok: true };
}

export async function markRepSeen({
  clinicId,
  mrVisitId,
  actorStaffId,
  doctorNotes,
  executor = db,
}: {
  clinicId: string;
  mrVisitId: string;
  actorStaffId: string | null;
  doctorNotes?: string;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<MrResult> {
  return executor.transaction(async (tx) => {
    const [visit] = await tx
      .select({ seenAt: mrVisits.seenAt, checkedInAt: mrVisits.checkedInAt })
      .from(mrVisits)
      .where(and(eq(mrVisits.clinicId, clinicId), eq(mrVisits.id, mrVisitId)));

    if (!visit) return { ok: false as const, error: "Visit not found" };
    if (visit.seenAt) return { ok: false as const, error: "Already marked seen" };

    await tx
      .update(mrVisits)
      .set({
        seenAt: new Date(),
        /* A rep who was never checked in (e.g. seen ad hoc) is still marked
           as having checked in — "seen" implies "arrived". */
        checkedInAt: visit.checkedInAt ?? new Date(),
        doctorNotes: doctorNotes?.trim() || undefined,
        updatedAt: new Date(),
      })
      .where(eq(mrVisits.id, mrVisitId));

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "mr_visit_completed",
      entityTable: "mr_visits",
      entityId: mrVisitId,
    });

    return { ok: true as const };
  });
}

export type LogWalkInResult =
  | { ok: true; mrVisitId: string }
  | { ok: false; error: string };

/**
 * Front desk logging a walk-in rep with no prior slot (§7.9 P0). Checked in
 * immediately — a walk-in who is standing at the counter is, by definition,
 * already waiting.
 */
export async function logWalkInRep({
  clinicId,
  repId,
  doctorId,
  actorStaffId,
  executor = db,
}: {
  clinicId: string;
  repId: string;
  doctorId: string;
  actorStaffId: string | null;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<LogWalkInResult> {
  try {
    const [visit] = await db
      .insert(mrVisits)
      .values({ clinicId, repId, doctorId, checkedInAt: new Date() })
      .returning({ id: mrVisits.id });

    await executor.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "mr_walkin_logged",
      entityTable: "mr_visits",
      entityId: visit.id,
    });

    return { ok: true, mrVisitId: visit.id };
  } catch (error) {
    console.error("logWalkInRep failed", error);
    return { ok: false, error: "Could not log the walk-in" };
  }
}
