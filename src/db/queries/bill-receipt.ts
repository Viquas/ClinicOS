import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import {
  billItems,
  bills,
  clinics,
  patients,
  payments,
  visits,
} from "@/db/schema";

export type BillReceiptLine = {
  kind: "service" | "goods";
  description: string;
  quantity: number;
  unitPaise: number;
  gstRate: number;
  lineTotalPaise: number;
};

export type BillReceiptData = {
  clinic: {
    name: string;
    addressLine: string | null;
    city: string | null;
    pincode: string | null;
    phone: string | null;
    gstin: string | null;
    isGstRegistered: boolean;
    ceaRegistrationNo: string | null;
  };
  patient: { name: string; phone: string };
  bill: {
    date: string;
    subtotalPaise: number;
    discountPaise: number;
    taxPaise: number;
    totalPaise: number;
    amountPaidPaise: number;
  };
  payments: { mode: string; amountPaise: number }[];
  lines: BillReceiptLine[];
};

/** Rupee-decimal string (as the numeric columns store it) → integer paise. */
function toPaise(value: string | null): number {
  return Math.round(Number(value ?? 0) * 100);
}

/**
 * The recorded bill for a visit, shaped for a printed receipt (§7.7, §9.4).
 *
 * Reads the stored bill — the authoritative money record — rather than
 * recomputing from lines: a receipt must show what was actually charged and
 * collected, down to the payment mode, not a fresh calculation that could
 * drift from the row the accountant reconciles against.
 *
 * Keyed by visitId so both callers reach it the same way — the counter that
 * just collected, and a patient asking for a duplicate copy weeks later.
 */
export async function getBillReceiptData(
  clinicId: string,
  visitId: string,
  tx: Executor = db,
): Promise<BillReceiptData | null> {
  const [bill] = await tx
    .select({
      id: bills.id,
      createdAt: bills.createdAt,
      closedAt: bills.closedAt,
      subtotal: bills.subtotal,
      discountAmount: bills.discountAmount,
      taxAmount: bills.taxAmount,
      total: bills.total,
      amountPaid: bills.amountPaid,
      patientId: visits.patientId,
      visitDate: visits.visitDate,
    })
    .from(bills)
    .innerJoin(visits, eq(visits.id, bills.visitId))
    .where(
      and(
        eq(bills.clinicId, clinicId),
        eq(bills.visitId, visitId),
        isNull(bills.archivedAt),
      ),
    )
    .orderBy(desc(bills.createdAt))
    .limit(1);

  if (!bill) return null;

  const [clinic] = await tx
    .select({
      name: clinics.name,
      addressLine: clinics.addressLine,
      city: clinics.city,
      pincode: clinics.pincode,
      phone: clinics.phone,
      gstin: clinics.gstin,
      isGstRegistered: clinics.isGstRegistered,
      ceaRegistrationNo: clinics.ceaRegistrationNo,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId));

  if (!clinic) return null;

  const [patient] = await tx
    .select({ name: patients.name, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, bill.patientId)));

  if (!patient) return null;

  const items = await tx
    .select({
      kind: billItems.kind,
      description: billItems.description,
      quantity: billItems.quantity,
      unitPrice: billItems.unitPrice,
      gstRate: billItems.gstRate,
      lineTotal: billItems.lineTotal,
    })
    .from(billItems)
    .where(and(eq(billItems.clinicId, clinicId), eq(billItems.billId, bill.id)))
    .orderBy(asc(billItems.createdAt));

  const paymentRows = await tx
    .select({ mode: payments.mode, amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.clinicId, clinicId), eq(payments.billId, bill.id)))
    .orderBy(asc(payments.createdAt));

  return {
    clinic,
    patient,
    bill: {
      date: (bill.closedAt ?? bill.createdAt).toISOString().slice(0, 10),
      subtotalPaise: toPaise(bill.subtotal),
      discountPaise: toPaise(bill.discountAmount),
      taxPaise: toPaise(bill.taxAmount),
      totalPaise: toPaise(bill.total),
      amountPaidPaise: toPaise(bill.amountPaid),
    },
    payments: paymentRows.map((p) => ({
      mode: p.mode,
      amountPaise: toPaise(p.amount),
    })),
    lines: items.map((it) => ({
      kind: it.kind,
      description: it.description,
      quantity: Number(it.quantity),
      unitPaise: toPaise(it.unitPrice),
      gstRate: Number(it.gstRate),
      lineTotalPaise: toPaise(it.lineTotal),
    })),
  };
}
