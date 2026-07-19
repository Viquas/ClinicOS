import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  doctors,
  inventoryItems,
  patients,
  procedures,
  procedureTasks,
  staff,
  tokens,
  visits,
} from "@/db/schema";

/**
 * Nursing/procedure tasks (§7.6) — the nurse tablet.
 *
 * Consumables are resolved to names here, not left as raw itemIds, so the
 * screen can show "Salbutamol Respules × 1" rather than a UUID the nurse
 * cannot act on.
 */

export type NursingTaskRow = {
  id: string;
  visitId: string;
  tokenNumber: number | null;
  patientName: string;
  patientAgeLabel: { dateOfBirth: string | null; ageYears: number | null };
  procedureName: string;
  notes: string | null;
  consumables: { name: string; unit: string; quantity: number }[];
  state: string;
  assignedToName: string | null;
  orderedByDoctorName: string;
  orderedAt: Date;
};

export async function getNursingTasks(
  clinicId: string,
  onDate: string,
  tx: Executor = db,
): Promise<NursingTaskRow[]> {
  const rows = await tx
    .select({
      id: procedureTasks.id,
      visitId: procedureTasks.visitId,
      state: procedureTasks.state,
      notes: procedureTasks.notes,
      orderedAt: procedureTasks.createdAt,
      procedureId: procedures.id,
      procedureName: procedures.name,
      consumables: procedures.consumables,
      patientName: patients.name,
      dateOfBirth: patients.dateOfBirth,
      ageYears: patients.ageYears,
      doctorName: staff.name,
      assignedToId: procedureTasks.assignedToStaffId,
      tokenNumber: tokens.number,
    })
    .from(procedureTasks)
    .innerJoin(procedures, eq(procedures.id, procedureTasks.procedureId))
    .innerJoin(visits, eq(visits.id, procedureTasks.visitId))
    .innerJoin(patients, eq(patients.id, visits.patientId))
    .innerJoin(doctors, eq(doctors.id, visits.doctorId))
    .innerJoin(staff, eq(staff.id, doctors.staffId))
    /* A task can exist before a token is issued for today's visit in theory;
       left join so it still renders rather than vanishing. */
    .leftJoin(
      tokens,
      and(
        eq(tokens.visitId, procedureTasks.visitId),
        eq(tokens.tokenDate, onDate),
      ),
    )
    .where(
      and(
        eq(procedureTasks.clinicId, clinicId),
        isNull(procedureTasks.archivedAt),
      ),
    )
    .orderBy(procedureTasks.createdAt);

  /* Resolve assignedTo names and consumable item names in two follow-up
     queries rather than N+1 per row. */
  const assignedIds = [
    ...new Set(rows.map((r) => r.assignedToId).filter((v): v is string => !!v)),
  ];
  const assignedNames = assignedIds.length
    ? await tx
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(inArray(staff.id, assignedIds))
    : [];
  const nameById = new Map(assignedNames.map((s) => [s.id, s.name]));

  const allItemIds = [
    ...new Set(
      rows.flatMap((r) =>
        ((r.consumables as { itemId: string; quantity: number }[]) ?? []).map(
          (c) => c.itemId,
        ),
      ),
    ),
  ];
  const items = allItemIds.length
    ? await tx
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.id, allItemIds))
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));

  return rows.map((r) => ({
    id: r.id,
    visitId: r.visitId,
    tokenNumber: r.tokenNumber,
    patientName: r.patientName,
    patientAgeLabel: { dateOfBirth: r.dateOfBirth, ageYears: r.ageYears },
    procedureName: r.procedureName,
    notes: r.notes,
    consumables: (
      (r.consumables as { itemId: string; quantity: number }[]) ?? []
    ).map((c) => ({
      name: itemById.get(c.itemId)?.name ?? "Unknown item",
      unit: itemById.get(c.itemId)?.unit ?? "",
      quantity: c.quantity,
    })),
    state: r.state,
    assignedToName: r.assignedToId
      ? (nameById.get(r.assignedToId) ?? null)
      : null,
    orderedByDoctorName: r.doctorName,
    orderedAt: r.orderedAt,
  }));
}
