import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  batches,
  billItems,
  bills,
  inventoryItems,
  patients,
  visits,
} from "@/db/schema";

/**
 * Owner dashboard aggregates (§7.11) — "how did we do this month" in one read.
 *
 * Revenue is split by bill-line kind: service lines are consultation and
 * procedure income, goods lines are pharmacy income. That split is the whole
 * point of the owner view, and it comes straight from the same lines the GST
 * calculation uses, so the dashboard and the bills can never disagree.
 */

export type DashboardData = {
  monthVisits: number;
  monthRevenuePaise: number;
  serviceRevenuePaise: number;
  goodsRevenuePaise: number;
  newPatients: number;
  expiringAlerts: {
    itemName: string;
    batchNo: string;
    days: number;
    quantity: number;
    unit: string;
  }[];
  lowStock: { itemName: string; quantity: number; unit: string; reorder: number }[];
  visitsByDay: { date: string; count: number }[];
};

export async function getDashboard(
  clinicId: string,
  monthStart: string,
  monthEnd: string,
  today: string,
): Promise<DashboardData> {
  const [visitCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visits)
    .where(
      and(
        eq(visits.clinicId, clinicId),
        gte(visits.visitDate, monthStart),
        lte(visits.visitDate, monthEnd),
        isNull(visits.archivedAt),
      ),
    );

  /* Revenue by line kind, joined bills → items and summed in SQL. `total` on
     a bill item is already the tax-inclusive line total. */
  const revenue = await db
    .select({
      kind: billItems.kind,
      sumPaise: sql<number>`coalesce(sum(${billItems.lineTotal}) * 100, 0)::bigint`,
    })
    .from(billItems)
    .innerJoin(bills, eq(bills.id, billItems.billId))
    .where(
      and(
        eq(bills.clinicId, clinicId),
        gte(sql`${bills.createdAt}::date`, monthStart),
        lte(sql`${bills.createdAt}::date`, monthEnd),
        isNull(bills.archivedAt),
      ),
    )
    .groupBy(billItems.kind);

  const servicePaise = Number(
    revenue.find((r) => r.kind === "service")?.sumPaise ?? 0,
  );
  const goodsPaise = Number(
    revenue.find((r) => r.kind === "goods")?.sumPaise ?? 0,
  );

  const [newPatientCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(patients)
    .where(
      and(
        eq(patients.clinicId, clinicId),
        gte(sql`${patients.createdAt}::date`, monthStart),
        lte(sql`${patients.createdAt}::date`, monthEnd),
        isNull(patients.archivedAt),
        isNull(patients.mergedIntoId),
      ),
    );

  /* Batches expiring within 60 days, still holding stock, not yet expired. */
  const expiring = await db
    .select({
      itemName: inventoryItems.name,
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      quantityRemaining: batches.quantityRemaining,
      unit: inventoryItems.unit,
    })
    .from(batches)
    .innerJoin(inventoryItems, eq(inventoryItems.id, batches.itemId))
    .where(
      and(
        eq(batches.clinicId, clinicId),
        isNull(batches.archivedAt),
        sql`${batches.quantityRemaining} > 0`,
        sql`${batches.expiryDate} > ${today}`,
        sql`${batches.expiryDate} <= (${today}::date + interval '60 days')`,
      ),
    )
    .orderBy(batches.expiryDate);

  const expiringAlerts = expiring.map((b) => ({
    itemName: b.itemName,
    batchNo: b.batchNo,
    days: Math.round(
      (new Date(`${b.expiryDate}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
    quantity: Number(b.quantityRemaining),
    unit: b.unit,
  }));

  /* Low stock: live (unexpired) quantity at or below the reorder level. */
  const stockLevels = await db
    .select({
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      reorder: inventoryItems.reorderLevel,
      liveQty: sql<number>`coalesce(sum(
        case when ${batches.expiryDate} > ${today}
             then ${batches.quantityRemaining} else 0 end
      ), 0)`,
    })
    .from(inventoryItems)
    .leftJoin(
      batches,
      and(eq(batches.itemId, inventoryItems.id), isNull(batches.archivedAt)),
    )
    .where(
      and(
        eq(inventoryItems.clinicId, clinicId),
        isNull(inventoryItems.archivedAt),
      ),
    )
    .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit, inventoryItems.reorderLevel);

  const lowStock = stockLevels
    .filter((s) => Number(s.liveQty) <= Number(s.reorder))
    .map((s) => ({
      itemName: s.name,
      quantity: Number(s.liveQty),
      unit: s.unit,
      reorder: Number(s.reorder),
    }));

  const byDay = await db
    .select({
      date: visits.visitDate,
      count: sql<number>`count(*)::int`,
    })
    .from(visits)
    .where(
      and(
        eq(visits.clinicId, clinicId),
        gte(visits.visitDate, monthStart),
        lte(visits.visitDate, monthEnd),
        isNull(visits.archivedAt),
      ),
    )
    .groupBy(visits.visitDate)
    .orderBy(visits.visitDate);

  return {
    monthVisits: visitCount?.n ?? 0,
    monthRevenuePaise: servicePaise + goodsPaise,
    serviceRevenuePaise: servicePaise,
    goodsRevenuePaise: goodsPaise,
    newPatients: newPatientCount?.n ?? 0,
    expiringAlerts,
    lowStock,
    visitsByDay: byDay.map((d) => ({ date: d.date, count: d.count })),
  };
}
