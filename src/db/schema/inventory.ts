import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
  itemFormEnum,
  scheduleClassEnum,
  stockMovementEnum,
  tenantColumns,
} from "./_shared";
import { staff } from "./clinic";
import { patients } from "./patients";

/**
 * The clinic formulary — the 50–150 SKUs this clinic actually stocks.
 * Deliberately not a drug directory: this is a dispensing counter, not a
 * retail pharmacy ERP (§7.5).
 */
export const inventoryItems = pgTable("inventory_items", {
  ...tenantColumns,

  name: text("name").notNull(),
  form: itemFormEnum("form").notNull(),
  strength: text("strength"),
  unit: text("unit").notNull(), // tab | ml | vial | piece

  scheduleClass: scheduleClassEnum("schedule_class").notNull().default("none"),

  reorderLevel: numeric("reorder_level", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),

  /* Consumables deduct against procedures, not prescriptions (§7.5). */
  isConsumable: boolean("is_consumable").notNull().default(false),

  /* MR samples live in the same table but dispense free of cost (§7.9 P1). */
  isSample: boolean("is_sample").notNull().default(false),

  mrpPerUnit: numeric("mrp_per_unit", { precision: 10, scale: 2 }),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
});

/**
 * Stock lives on batches, never on the item — an item's quantity is the sum of
 * its unexpired batches. FEFO selection and the expiry block both depend on
 * this, so there is intentionally no denormalised `inventory_items.quantity`
 * that could drift out of agreement with the batches.
 */
export const batches = pgTable(
  "batches",
  {
    ...tenantColumns,

    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),

    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),

    quantityReceived: numeric("quantity_received", {
      precision: 10,
      scale: 2,
    }).notNull(),
    quantityRemaining: numeric("quantity_remaining", {
      precision: 10,
      scale: 2,
    }).notNull(),

    costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }),

    supplierName: text("supplier_name"),
    invoiceNo: text("invoice_no"),
  },
  (t) => [
    /* The FEFO lookup: oldest unexpired batch of an item with stock left. */
    index("batches_fefo_idx").on(t.clinicId, t.itemId, t.expiryDate),
  ],
);

/** Append-only ledger. Every quantity change in the system lands here. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...tenantColumns,

    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),

    kind: stockMovementEnum("kind").notNull(),

    /* Negative for dispense and write-off, positive for purchase. */
    quantityDelta: numeric("quantity_delta", {
      precision: 10,
      scale: 2,
    }).notNull(),

    /* Whichever of these applies: a visit, a procedure task, or an adjustment. */
    visitId: uuid("visit_id"),
    procedureTaskId: uuid("procedure_task_id"),

    reason: text("reason"),
    byStaffId: uuid("by_staff_id").references(() => staff.id),
  },
  (t) => [index("stock_movements_batch_idx").on(t.batchId, t.createdAt)],
);

/**
 * Schedule H1 register — mandatory under the Drugs & Cosmetics Rules (§9.3).
 * Written automatically on every H1 dispense and exportable as-is; kept as its
 * own table rather than a query over movements so the legal record stays
 * stable even if dispensing logic is refactored later.
 */
export const scheduleH1Register = pgTable("schedule_h1_register", {
  ...tenantColumns,

  dispensedOn: date("dispensed_on").notNull(),

  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  patientName: text("patient_name").notNull(),
  patientAddress: text("patient_address"),

  doctorName: text("doctor_name").notNull(),
  doctorRegistrationNo: text("doctor_registration_no"),

  drugName: text("drug_name").notNull(),
  batchNo: text("batch_no").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),

  dispensedByStaffId: uuid("dispensed_by_staff_id").references(() => staff.id),
});
