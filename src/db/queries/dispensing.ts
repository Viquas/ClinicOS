import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  batches,
  doctors,
  inventoryItems,
  patients,
  prescriptionItems,
  prescriptions,
  staff,
  tokens,
  visits,
} from "@/db/schema";
import type { BatchRow } from "./pharmacy";

/**
 * Everything the pharmacy counter needs for one dispense (§7.5): the patient,
 * the prescribing doctor, and each prescribed line with the item's batches in
 * FEFO order.
 *
 * The batches come back nearest-expiry-first straight from SQL, so the
 * screen's pre-selection is "the first non-expired one" and the ordering rule
 * is not restated in the component.
 */

export type DispensingLine = {
  prescriptionItemId: string;
  itemId: string | null;
  drugName: string;
  strength: string | null;
  unit: string | null;
  scheduleClass: string;
  quantity: number;
  batches: BatchRow[];
};

export type DispensingContext = {
  visitId: string;
  tokenNumber: number;
  patient: { id: string; name: string; sex: string };
  doctor: { name: string; registrationNo: string | null };
  lines: DispensingLine[];
};

/**
 * Loads the token currently at the pharmacy for a clinic. Returns null when
 * the counter is idle, which the screen renders as an empty state rather than
 * an error.
 */
export async function getDispensingContext(
  clinicId: string,
  onDate: string,
  tx: Executor = db,
): Promise<DispensingContext | null> {
  const [head] = await tx
    .select({
      visitId: visits.id,
      tokenNumber: tokens.number,
      patientId: patients.id,
      patientName: patients.name,
      patientSex: patients.sex,
      doctorName: staff.name,
      doctorReg: doctors.registrationNo,
    })
    .from(tokens)
    .innerJoin(visits, eq(visits.id, tokens.visitId))
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .innerJoin(doctors, eq(doctors.id, tokens.doctorId))
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    .where(
      and(
        eq(tokens.clinicId, clinicId),
        eq(tokens.tokenDate, onDate),
        eq(tokens.state, "at_pharmacy"),
        isNull(tokens.archivedAt),
      ),
    )
    .orderBy(asc(tokens.number))
    .limit(1);

  if (!head) return null;

  const [rx] = await tx
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.clinicId, clinicId),
        eq(prescriptions.visitId, head.visitId),
        isNull(prescriptions.archivedAt),
      ),
    )
    .limit(1);

  if (!rx) {
    /* A visit at the pharmacy with no prescription on it — nothing to
       dispense. The screen shows the patient and an empty line list. */
    return {
      visitId: head.visitId,
      tokenNumber: head.tokenNumber,
      patient: {
        id: head.patientId,
        name: head.patientName,
        sex: head.patientSex,
      },
      doctor: { name: head.doctorName, registrationNo: head.doctorReg },
      lines: [],
    };
  }

  const itemRows = await tx
    .select({
      prescriptionItemId: prescriptionItems.id,
      itemId: prescriptionItems.inventoryItemId,
      drugName: prescriptionItems.drugName,
      strength: prescriptionItems.strength,
      scheduleClass: prescriptionItems.scheduleClass,
      quantity: prescriptionItems.quantity,
      unit: inventoryItems.unit,
    })
    .from(prescriptionItems)
    .leftJoin(
      inventoryItems,
      eq(inventoryItems.id, prescriptionItems.inventoryItemId),
    )
    .where(
      and(
        eq(prescriptionItems.clinicId, clinicId),
        eq(prescriptionItems.prescriptionId, rx.id),
        isNull(prescriptionItems.archivedAt),
      ),
    );

  const lines: DispensingLine[] = [];

  for (const item of itemRows) {
    let itemBatches: BatchRow[] = [];

    if (item.itemId) {
      const rows = await tx
        .select({
          id: batches.id,
          batchNo: batches.batchNo,
          expiryDate: batches.expiryDate,
          quantityRemaining: batches.quantityRemaining,
        })
        .from(batches)
        .where(
          and(
            eq(batches.clinicId, clinicId),
            eq(batches.itemId, item.itemId),
            isNull(batches.archivedAt),
          ),
        )
        /* FEFO: nearest expiry first (§7.5). */
        .orderBy(asc(batches.expiryDate));

      itemBatches = rows.map((b) => ({
        id: b.id,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        quantityRemaining: Number(b.quantityRemaining),
      }));
    }

    lines.push({
      prescriptionItemId: item.prescriptionItemId,
      itemId: item.itemId,
      drugName: item.drugName,
      strength: item.strength,
      unit: item.unit,
      scheduleClass: item.scheduleClass,
      quantity: item.quantity === null ? 1 : Number(item.quantity),
      batches: itemBatches,
    });
  }

  return {
    visitId: head.visitId,
    tokenNumber: head.tokenNumber,
    patient: {
      id: head.patientId,
      name: head.patientName,
      sex: head.patientSex,
    },
    doctor: { name: head.doctorName, registrationNo: head.doctorReg },
    lines,
  };
}
