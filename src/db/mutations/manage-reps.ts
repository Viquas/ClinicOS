import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, medicalReps, mrCompanies, mrVisits } from "@/db/schema";

export type AddRepResult =
  | { ok: true; repId: string }
  | { ok: false; error: string };

export type RepResult = { ok: true } | { ok: false; error: string };

/**
 * The rep formulary (§7.9).
 *
 * Reps and their companies existed only in the seed, so a clinic meeting a
 * new rep had nowhere to record them — the queue could check in and log
 * walk-ins, but only for people who happened to be seeded. This closes that.
 *
 * Companies are matched case-insensitively by name rather than picked from a
 * list. A front desk typing "cipla" while "Cipla" already exists would
 * otherwise create a second company, and the rep directory would then show
 * the same firm twice with its reps split between them. Matching on the way
 * in is cheaper than merging duplicates later.
 */
export async function addRep({
  clinicId,
  actorStaffId,
  name,
  companyName,
  phone,
  division,
  executor = db,
}: {
  clinicId: string;
  actorStaffId: string;
  name: string;
  companyName: string;
  phone?: string | null;
  division?: string | null;
  executor?: Executor;
}): Promise<AddRepResult> {
  const trimmedName = name.trim();
  const trimmedCompany = companyName.trim();

  if (trimmedName.length < 2) {
    return { ok: false, error: "Enter the rep's name" };
  }
  if (trimmedCompany.length < 2) {
    return { ok: false, error: "Enter the company name" };
  }

  const digits = phone?.replace(/\D/g, "") || null;
  if (digits && digits.length !== 10) {
    return { ok: false, error: "Enter a 10-digit phone number" };
  }

  return executor.transaction(async (tx) => {
    /* Case-insensitive match so "cipla" finds "Cipla". */
    const [existing] = await tx
      .select({ id: mrCompanies.id })
      .from(mrCompanies)
      .where(
        and(
          eq(mrCompanies.clinicId, clinicId),
          isNull(mrCompanies.archivedAt),
          sql`lower(${mrCompanies.name}) = lower(${trimmedCompany})`,
        ),
      );

    const companyId =
      existing?.id ??
      (
        await tx
          .insert(mrCompanies)
          .values({ clinicId, name: trimmedCompany })
          .returning({ id: mrCompanies.id })
      )[0].id;

    const [rep] = await tx
      .insert(medicalReps)
      .values({
        clinicId,
        companyId,
        name: trimmedName,
        phone: digits,
        division: division?.trim() || null,
      })
      .returning({ id: medicalReps.id });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "mr_rep_added",
      entityTable: "medical_reps",
      entityId: rep.id,
      detail: { name: trimmedName, company: trimmedCompany },
    });

    return { ok: true as const, repId: rep.id };
  });
}

/**
 * Retires a rep from the formulary.
 *
 * Archived, never deleted, and their visit history stays joinable — a rep who
 * changed territory should stop appearing in the walk-in picker without
 * erasing the fact that they visited last March. The company is left alone:
 * it may still have other reps, and an empty company is harmless.
 */
export async function archiveRep({
  clinicId,
  repId,
  actorStaffId,
  executor = db,
}: {
  clinicId: string;
  repId: string;
  actorStaffId: string;
  executor?: Executor;
}): Promise<RepResult> {
  return executor.transaction(async (tx) => {
    const [rep] = await tx
      .select({ id: medicalReps.id, name: medicalReps.name })
      .from(medicalReps)
      .where(
        and(
          eq(medicalReps.clinicId, clinicId),
          eq(medicalReps.id, repId),
          isNull(medicalReps.archivedAt),
        ),
      )
      .for("update");

    if (!rep) {
      return { ok: false as const, error: "Rep not found" };
    }

    /* An open visit would otherwise sit in the queue forever, un-actionable:
       archiving hides the rep from the board that offers the buttons. */
    const [openVisit] = await tx
      .select({ id: mrVisits.id })
      .from(mrVisits)
      .where(
        and(
          eq(mrVisits.clinicId, clinicId),
          eq(mrVisits.repId, repId),
          isNull(mrVisits.seenAt),
          isNull(mrVisits.archivedAt),
        ),
      );

    if (openVisit) {
      return {
        ok: false as const,
        error: "This rep has a visit still open — mark it seen first",
      };
    }

    await tx
      .update(medicalReps)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(medicalReps.id, repId));

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "mr_rep_archived",
      entityTable: "medical_reps",
      entityId: repId,
      detail: { name: rep.name },
    });

    return { ok: true as const };
  });
}
