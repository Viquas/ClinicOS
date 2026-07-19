import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  batches,
  bills,
  clinics,
  doctors,
  inventoryItems,
  procedureTasks,
  procedures,
  staff,
  stockMovements,
  tokens,
  visits,
} from "@/db/schema";
import { computeTotals, type BillLine } from "@/lib/billing/gst";

/**
 * Assembles the bill for a visit from what actually happened (§7.7).
 *
 * The goods lines are derived from the dispense ledger, not from the
 * prescription — a patient is billed for what left the shelf, not for what was
 * written. Under-dispensing (the "buy outside" case) then bills correctly
 * without any separate bookkeeping.
 *
 * Consultation is a flat exempt service here; a real deployment reads the fee
 * from clinic settings. Completed procedures add their own service lines
 * below, priced from the procedure's charge.
 */

const CONSULTATION_FEE_PAISE = 30000; // ₹300

export type BillDraft = {
  visitId: string;
  tokenNumber: number | null;
  patientBillable: boolean;
  alreadyBilled: boolean;
  isGstRegistered: boolean;
  lines: (BillLine & { key: string })[];
  totals: ReturnType<typeof computeTotals>;
};

export async function getBillDraft(
  clinicId: string,
  visitId: string,
  tx: Executor = db,
): Promise<BillDraft | null> {
  const [visit] = await tx
    .select({ id: visits.id })
    .from(visits)
    .where(and(eq(visits.clinicId, clinicId), eq(visits.id, visitId)))
    .limit(1);

  if (!visit) return null;

  const [clinic] = await tx
    .select({ isGstRegistered: clinics.isGstRegistered })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  const [tokenRow] = await tx
    .select({ number: tokens.number })
    .from(tokens)
    .where(and(eq(tokens.clinicId, clinicId), eq(tokens.visitId, visitId)))
    .limit(1);

  const [doctorRow] = await tx
    .select({ name: staff.name })
    .from(visits)
    .innerJoin(doctors, eq(doctors.id, visits.doctorId))
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    .where(eq(visits.id, visitId))
    .limit(1);

  const [existing] = await tx
    .select({ id: bills.id })
    .from(bills)
    .where(
      and(
        eq(bills.clinicId, clinicId),
        eq(bills.visitId, visitId),
        isNull(bills.archivedAt),
      ),
    )
    .limit(1);

  /*
   * Goods lines from the ledger. Each dispense movement is negative; the bill
   * charges its absolute quantity at the item's MRP. Grouped by item so three
   * bottles across two batches read as one line of three, which is what the
   * patient expects to see.
   */
  const movements = await tx
    .select({
      itemId: inventoryItems.id,
      name: inventoryItems.name,
      strength: inventoryItems.strength,
      unit: inventoryItems.unit,
      mrpPerUnit: inventoryItems.mrpPerUnit,
      gstRate: inventoryItems.gstRate,
      isConsumable: inventoryItems.isConsumable,
      quantityDelta: stockMovements.quantityDelta,
    })
    .from(stockMovements)
    .innerJoin(batches, eq(batches.id, stockMovements.batchId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, batches.itemId))
    .where(
      and(
        eq(stockMovements.clinicId, clinicId),
        eq(stockMovements.visitId, visitId),
        eq(stockMovements.kind, "dispense"),
      ),
    );

  const goodsByItem = new Map<
    string,
    {
      name: string;
      strength: string | null;
      qty: number;
      mrp: number;
      gst: number;
    }
  >();

  for (const m of movements) {
    /* Consumables deducted against procedures are not billed as goods here;
       their cost sits inside the procedure charge (§7.5). */
    if (m.isConsumable) continue;
    if (m.mrpPerUnit === null) continue;

    const qty = Math.abs(Number(m.quantityDelta));
    const existingLine = goodsByItem.get(m.itemId);

    if (existingLine) {
      existingLine.qty += qty;
    } else {
      goodsByItem.set(m.itemId, {
        name: m.name,
        strength: m.strength,
        qty,
        mrp: Math.round(Number(m.mrpPerUnit) * 100),
        gst: Number(m.gstRate),
      });
    }
  }

  /*
   * Completed procedures bill as their own service line — the charge the
   * comment above always intended, now actually wired. Only "done" tasks
   * count: a pending or in-progress procedure has not happened yet and must
   * not appear on what the patient owes.
   */
  const completedProcedures = await tx
    .select({
      taskId: procedureTasks.id,
      name: procedures.name,
      charge: procedures.charge,
    })
    .from(procedureTasks)
    .innerJoin(procedures, eq(procedures.id, procedureTasks.procedureId))
    .where(
      and(
        eq(procedureTasks.clinicId, clinicId),
        eq(procedureTasks.visitId, visitId),
        eq(procedureTasks.state, "done"),
      ),
    );

  const lines: (BillLine & { key: string })[] = [
    {
      key: "consultation",
      description: doctorRow
        ? `Consultation — ${doctorRow.name}`
        : "Consultation",
      kind: "service",
      quantity: 1,
      unitPaise: CONSULTATION_FEE_PAISE,
      gstRate: 0,
    },
    ...completedProcedures.map((p) => ({
      key: `procedure:${p.taskId}`,
      description: p.name,
      kind: "service" as const,
      quantity: 1,
      unitPaise: Math.round(Number(p.charge) * 100),
      gstRate: 0,
    })),
    ...[...goodsByItem.entries()].map(([itemId, g]) => ({
      key: itemId,
      description: g.strength ? `${g.name} ${g.strength}` : g.name,
      kind: "goods" as const,
      quantity: g.qty,
      unitPaise: g.mrp,
      gstRate: g.gst,
    })),
  ];

  const totals = computeTotals(lines, {
    isGstRegistered: clinic?.isGstRegistered ?? false,
  });

  return {
    visitId,
    tokenNumber: tokenRow?.number ?? null,
    patientBillable: true,
    alreadyBilled: Boolean(existing),
    isGstRegistered: clinic?.isGstRegistered ?? false,
    lines,
    totals,
  };
}
