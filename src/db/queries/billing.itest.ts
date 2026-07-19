import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, stockMovements, visits } from "@/db/schema";
import { getBillDraft } from "./billing";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DOCTOR = "33333333-0000-0000-0000-000000000001";
const PARACETAMOL = "55555555-0000-0000-0000-000000000001"; // MRP 56.00, GST 12
const ORS = "55555555-0000-0000-0000-000000000005"; // consumable, MRP 22.00

const PROBE_BATCH_A = "eeee0000-0000-0000-0000-0000000000a1";
const PROBE_BATCH_B = "eeee0000-0000-0000-0000-0000000000b1";
const ORS_BATCH = "eeee0000-0000-0000-0000-0000000000c1";

let visitId: string;

async function cleanup() {
  if (visitId) {
    await db.delete(stockMovements).where(eq(stockMovements.visitId, visitId));
    await db.delete(visits).where(eq(visits.id, visitId));
  }
  for (const id of [PROBE_BATCH_A, PROBE_BATCH_B, ORS_BATCH]) {
    await db.delete(stockMovements).where(eq(stockMovements.batchId, id));
    await db.delete(batches).where(eq(batches.id, id));
  }
}

beforeEach(async () => {
  await cleanup();

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

  await db.insert(batches).values([
    {
      id: PROBE_BATCH_A,
      clinicId: CLINIC,
      itemId: PARACETAMOL,
      batchNo: "BILL-A",
      expiryDate: "2027-12-31",
      quantityReceived: "20",
      quantityRemaining: "18",
    },
    {
      id: PROBE_BATCH_B,
      clinicId: CLINIC,
      itemId: PARACETAMOL,
      batchNo: "BILL-B",
      expiryDate: "2028-01-31",
      quantityReceived: "20",
      quantityRemaining: "19",
    },
    {
      id: ORS_BATCH,
      clinicId: CLINIC,
      itemId: ORS,
      batchNo: "BILL-ORS",
      expiryDate: "2028-06-30",
      quantityReceived: "50",
      quantityRemaining: "48",
    },
  ]);
});

afterEach(cleanup);

async function dispenseMovement(batchId: string, qty: number) {
  await db.insert(stockMovements).values({
    clinicId: CLINIC,
    batchId,
    kind: "dispense",
    quantityDelta: String(-qty),
    visitId,
  });
}

describe("getBillDraft", () => {
  it("always includes the consultation as an exempt service", async () => {
    const draft = await getBillDraft(CLINIC, visitId);

    const consult = draft!.lines.find((l) => l.key === "consultation")!;
    expect(consult.kind).toBe("service");
    expect(consult.unitPaise).toBe(30000);
    expect(draft!.totals.exemptPaise).toBe(30000);
  });

  it("bills dispensed medicine as a taxable goods line at MRP", async () => {
    await dispenseMovement(PROBE_BATCH_A, 2);

    const draft = await getBillDraft(CLINIC, visitId);
    const goods = draft!.lines.find((l) => l.kind === "goods")!;

    expect(goods.quantity).toBe(2);
    expect(goods.unitPaise).toBe(5600); // ₹56 MRP
    expect(goods.gstRate).toBe(12);
    /* 2 × ₹56 = ₹112, tax extracted from within: 11200 × 12/112 = 1200. */
    expect(draft!.totals.taxableGrossPaise).toBe(11200);
    expect(draft!.totals.taxPaise).toBe(1200);
  });

  it("groups the same item dispensed across two batches into one line", async () => {
    /* FEFO can split one prescribed quantity across batches; the patient
       should still see a single line of the combined count. */
    await dispenseMovement(PROBE_BATCH_A, 2);
    await dispenseMovement(PROBE_BATCH_B, 1);

    const draft = await getBillDraft(CLINIC, visitId);
    const goodsLines = draft!.lines.filter((l) => l.kind === "goods");

    expect(goodsLines).toHaveLength(1);
    expect(goodsLines[0].quantity).toBe(3);
  });

  it("excludes consumables from goods lines", async () => {
    /* ORS is a consumable — its cost belongs to a procedure charge, not a
       medicine line (§7.5). */
    await dispenseMovement(ORS_BATCH, 4);

    const draft = await getBillDraft(CLINIC, visitId);
    const goodsLines = draft!.lines.filter((l) => l.kind === "goods");

    expect(goodsLines).toHaveLength(0);
  });

  it("bills for what left the shelf, not what was prescribed", async () => {
    /* Under-dispense: prescribed 3, only 1 given. The bill charges 1. */
    await dispenseMovement(PROBE_BATCH_A, 1);

    const draft = await getBillDraft(CLINIC, visitId);
    const goods = draft!.lines.find((l) => l.kind === "goods")!;

    expect(goods.quantity).toBe(1);
  });

  it("reports whether the visit is already billed", async () => {
    const draft = await getBillDraft(CLINIC, visitId);
    expect(draft!.alreadyBilled).toBe(false);
  });

  it("returns null for a visit in another clinic", async () => {
    expect(await getBillDraft(OTHER_CLINIC, visitId)).toBeNull();
  });

  it("returns null for an unknown visit", async () => {
    expect(
      await getBillDraft(CLINIC, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("keeps the total as the sum of MRP and fee, tax not added on top", async () => {
    await dispenseMovement(PROBE_BATCH_A, 2);

    const draft = await getBillDraft(CLINIC, visitId);
    /* ₹300 consult + ₹112 goods = ₹412. The tax is inside the ₹112. */
    expect(draft!.totals.payablePaise).toBe(41200);
  });
});
