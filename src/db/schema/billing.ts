import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { paymentModeEnum, tenantColumns } from "./_shared";
import { staff } from "./clinic";
import { visits } from "./visits";

/**
 * The GST split that §7.7 and §9.4 require: healthcare services by a clinical
 * establishment are exempt, medicines sold are taxable. One bill carries both,
 * so the distinction lives on the line, not the bill.
 */
export const billLineKindEnum = pgEnum("bill_line_kind", [
  "service", // consultation, procedure — GST exempt
  "goods", // dispensed medicine, consumable — taxable
]);

export const bills = pgTable(
  "bills",
  {
    ...tenantColumns,

    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id),

    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /* Discounts are never anonymous — the owner configures per-role limits. */
    discountReason: text("discount_reason"),
    discountByStaffId: uuid("discount_by_staff_id").references(() => staff.id),

    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("bills_clinic_created_idx").on(t.clinicId, t.createdAt),
    /*
     * A real guarantee, not just an application-level check: recordBill's own
     * "does a bill already exist" query was a plain SELECT-then-INSERT with no
     * lock, and a concurrent double-tap on "collect" could get genuine overlap
     * and insert two bills for the same visit — caught by this session's own
     * test suite under load, not by design. Partial so a future void-and-rebill
     * flow (archive the old bill, then bill again) is not blocked by it.
     */
    uniqueIndex("bills_one_active_per_visit_idx")
      .on(t.visitId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

export const billItems = pgTable("bill_items", {
  ...tenantColumns,

  billId: uuid("bill_id")
    .notNull()
    .references(() => bills.id),

  kind: billLineKindEnum("kind").notNull(),
  description: text("description").notNull(),

  /* Set for goods lines so the bill traces back to what left the shelf. */
  batchId: uuid("batch_id"),
  procedureTaskId: uuid("procedure_task_id"),

  quantity: numeric("quantity", { precision: 10, scale: 2 })
    .notNull()
    .default("1"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
});

/** Split payments are the norm — part UPI, part cash — so this is a list. */
export const payments = pgTable("payments", {
  ...tenantColumns,

  billId: uuid("bill_id")
    .notNull()
    .references(() => bills.id),

  mode: paymentModeEnum("mode").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reference: text("reference"),
  collectedByStaffId: uuid("collected_by_staff_id").references(() => staff.id),
});
