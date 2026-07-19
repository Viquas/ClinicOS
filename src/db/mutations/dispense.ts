import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  batches,
  inventoryItems,
  scheduleH1Register,
  stockMovements,
} from "@/db/schema";

/**
 * Dispensing (§7.5) — the most safety-critical mutation in the product.
 *
 * Four things must hold together or not at all:
 *
 *  1. Expired stock is refused. Not warned about — refused. The check happens
 *     inside the transaction against the row as locked, not against whatever
 *     the screen was showing when the pharmacist tapped.
 *  2. Stock cannot go negative. Two counters dispensing the same batch at
 *     once must not both succeed; the row is locked FOR UPDATE so the second
 *     waits and then sees the decremented quantity.
 *  3. Schedule H1 dispensing writes the statutory register (§9.3).
 *  4. Every movement lands in the append-only ledger that batch quantities
 *     must reconcile against.
 *
 * The screen also runs FEFO selection, but this layer does not trust it: an
 * operator may override the suggestion, and a stale page may submit a batch
 * that expired since it loaded.
 */

export type DispenseLine = {
  batchId: string;
  quantity: number;
};

export type DispenseResult =
  | { ok: true; dispensed: { batchNo: string; quantity: number }[] }
  | { ok: false; error: string };

export async function dispense({
  clinicId,
  visitId,
  lines,
  actorStaffId,
  patient,
  doctor,
  asOf,
}: {
  clinicId: string;
  visitId: string;
  lines: DispenseLine[];
  actorStaffId: string | null;
  /* Denormalised onto the H1 register because it is a legal record that must
     stay readable even if the patient record is later corrected. */
  patient: { id: string; name: string; address?: string | null };
  doctor: { name: string; registrationNo: string | null };
  asOf: Date;
}): Promise<DispenseResult> {
  if (lines.length === 0) {
    return { ok: false, error: "Nothing to dispense" };
  }

  if (lines.some((line) => line.quantity <= 0)) {
    return { ok: false, error: "Quantity must be greater than zero" };
  }

  const today = asOf.toISOString().slice(0, 10);

  try {
    return await db.transaction(async (tx) => {
      const dispensed: { batchNo: string; quantity: number }[] = [];

      for (const line of lines) {
        /*
         * FOR UPDATE: holds the row until this transaction commits, so a
         * concurrent dispense of the same batch blocks here rather than
         * reading a stale quantity and overselling.
         */
        const locked = await tx.execute<{
          id: string;
          batch_no: string;
          expiry_date: string;
          quantity_remaining: string;
          item_id: string;
          item_name: string;
          schedule_class: string;
        }>(sql`
          select b.id, b.batch_no, b.expiry_date, b.quantity_remaining,
                 i.id as item_id, i.name as item_name, i.schedule_class
            from ${batches} b
            join ${inventoryItems} i on i.id = b.item_id
           where b.id = ${line.batchId}
             and b.clinic_id = ${clinicId}
           for update of b
        `);

        const row = locked[0];
        if (!row) {
          throw new DispenseError("That batch no longer exists");
        }

        /* Checked here, against the locked row — not against what the screen
           displayed, which may be minutes old. */
        if (row.expiry_date <= today) {
          throw new DispenseError(
            `${row.item_name} batch ${row.batch_no} has expired and cannot be dispensed`,
          );
        }

        const remaining = Number(row.quantity_remaining);
        if (remaining < line.quantity) {
          throw new DispenseError(
            `Only ${remaining} left of ${row.item_name} batch ${row.batch_no}`,
          );
        }

        await tx
          .update(batches)
          .set({
            quantityRemaining: sql`${batches.quantityRemaining} - ${line.quantity}`,
            updatedAt: new Date(),
          })
          .where(and(eq(batches.clinicId, clinicId), eq(batches.id, line.batchId)));

        await tx.insert(stockMovements).values({
          clinicId,
          batchId: line.batchId,
          kind: "dispense",
          quantityDelta: String(-line.quantity),
          visitId,
          byStaffId: actorStaffId,
        });

        /* Schedule H1 — statutory register, written automatically (§9.3). */
        if (row.schedule_class === "h1") {
          await tx.insert(scheduleH1Register).values({
            clinicId,
            dispensedOn: today,
            patientId: patient.id,
            patientName: patient.name,
            patientAddress: patient.address ?? null,
            doctorName: doctor.name,
            doctorRegistrationNo: doctor.registrationNo,
            drugName: row.item_name,
            batchNo: row.batch_no,
            quantity: String(line.quantity),
            dispensedByStaffId: actorStaffId,
          });
        }

        dispensed.push({ batchNo: row.batch_no, quantity: line.quantity });
      }

      await tx.insert(auditLog).values({
        clinicId,
        actorStaffId,
        action: "dispensed",
        entityTable: "visits",
        entityId: visitId,
        detail: { lines: dispensed },
      });

      return { ok: true as const, dispensed };
    });
  } catch (error) {
    if (error instanceof DispenseError) {
      /* An expected refusal — the transaction rolled back, so nothing moved. */
      return { ok: false, error: error.message };
    }

    console.error("dispense failed", error);
    return { ok: false, error: "Dispensing failed — nothing was changed" };
  }
}

/** Thrown to abort the transaction with a message meant for the pharmacist. */
class DispenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispenseError";
  }
}
