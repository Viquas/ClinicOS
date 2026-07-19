import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Columns every tenant-scoped table carries.
 *
 * `clinicId` is the RLS boundary — Supabase policies compare it against the
 * clinic_id JWT claim, so it is non-null everywhere with no exceptions.
 *
 * `archivedAt` exists because medical records are never hard-deleted
 * (PRD §9.6 — OPD retention norms). Deletion in this product means archival.
 */
export const tenantColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
};

export const sexEnum = pgEnum("sex", ["male", "female", "other"]);

/** Role stacking is first-class: one login can hold several of these at once. */
export const staffRoleEnum = pgEnum("staff_role", [
  "owner",
  "doctor",
  "front_desk",
  "nurse",
  "pharmacy",
]);

/** Token lifecycle — PRD §7.2. */
export const tokenStateEnum = pgEnum("token_state", [
  "waiting",
  "vitals_done",
  "with_doctor",
  "at_pharmacy",
  "billed",
  "closed",
]);

/** Drugs & Cosmetics schedule class. H1 drives the mandatory register (§7.5). */
export const scheduleClassEnum = pgEnum("schedule_class", [
  "none",
  "h",
  "h1",
  "x",
]);

export const itemFormEnum = pgEnum("item_form", [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "ointment",
  "drops",
  "consumable",
]);

export const stockMovementEnum = pgEnum("stock_movement_kind", [
  "purchase",
  "dispense",
  "adjustment",
  "expiry_writeoff",
  "sample_in",
]);

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "upi", "card"]);
