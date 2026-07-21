import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billItems, bills, payments, visits } from "@/db/schema";
import { clinicToday } from "@/lib/clinic-date";
import { getBillReceiptData } from "./bill-receipt";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DOCTOR = "33333333-0000-0000-0000-000000000001";

let visitId: string;
let billId: string;

async function cleanup() {
  if (billId) {
    await db.delete(payments).where(eq(payments.billId, billId));
    await db.delete(billItems).where(eq(billItems.billId, billId));
    await db.delete(bills).where(eq(bills.id, billId));
  }
  if (visitId) {
    await db.delete(visits).where(eq(visits.id, visitId));
  }
}

beforeEach(async () => {
  const [visit] = await db
    .insert(visits)
    .values({
      clinicId: CLINIC,
      patientId: AARAV,
      doctorId: DOCTOR,
      visitDate: clinicToday(),
    })
    .returning({ id: visits.id });
  visitId = visit.id;

  const [bill] = await db
    .insert(bills)
    .values({
      clinicId: CLINIC,
      visitId,
      subtotal: "434.00",
      taxAmount: "20.67",
      total: "434.00",
      amountPaid: "434.00",
      closedAt: new Date(),
    })
    .returning({ id: bills.id });
  billId = bill.id;

  await db.insert(billItems).values([
    {
      clinicId: CLINIC,
      billId,
      kind: "service",
      description: "Consultation",
      quantity: "1",
      unitPrice: "300.00",
      gstRate: "0",
      lineTotal: "300.00",
    },
    {
      clinicId: CLINIC,
      billId,
      kind: "goods",
      description: "Paracetamol Syrup",
      quantity: "1",
      unitPrice: "134.00",
      gstRate: "12",
      lineTotal: "134.00",
    },
  ]);

  await db.insert(payments).values({
    clinicId: CLINIC,
    billId,
    mode: "upi",
    amount: "434.00",
  });
});

afterEach(cleanup);

describe("getBillReceiptData", () => {
  it("returns the recorded bill in paise with its lines and payment", async () => {
    const data = await getBillReceiptData(CLINIC, visitId);

    expect(data).not.toBeNull();
    expect(data!.bill.totalPaise).toBe(43400);
    expect(data!.bill.taxPaise).toBe(2067);
    expect(data!.bill.amountPaidPaise).toBe(43400);

    expect(data!.lines).toHaveLength(2);
    const service = data!.lines.find((l) => l.kind === "service");
    const goods = data!.lines.find((l) => l.kind === "goods");
    expect(service?.lineTotalPaise).toBe(30000);
    expect(goods?.unitPaise).toBe(13400);
    expect(goods?.gstRate).toBe(12);

    expect(data!.payments).toEqual([{ mode: "upi", amountPaise: 43400 }]);
    expect(data!.patient.name).toBeTruthy();
  });

  it("returns null for a visit that has no bill", async () => {
    const data = await getBillReceiptData(
      CLINIC,
      "00000000-0000-0000-0000-0000000000ff",
    );
    expect(data).toBeNull();
  });
});
