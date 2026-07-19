import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { scheduleClassEnum, tenantColumns, tokenStateEnum } from "./_shared";
import { doctors, staff } from "./clinic";
import { patients } from "./patients";

export const visits = pgTable(
  "visits",
  {
    ...tenantColumns,

    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id),

    visitDate: date("visit_date").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("visits_patient_idx").on(t.patientId, t.visitDate),
    index("visits_clinic_date_idx").on(t.clinicId, t.visitDate),
  ],
);

/**
 * Tokens number per doctor per day, not per clinic — multi-doctor clinics run
 * parallel queues and patients track "Dr. Rahman's number 12" (§7.2).
 */
export const tokens = pgTable(
  "tokens",
  {
    ...tenantColumns,

    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id),

    tokenDate: date("token_date").notNull(),
    number: integer("number").notNull(),

    state: tokenStateEnum("state").notNull().default("waiting"),
    isPriority: boolean("is_priority").notNull().default(false),

    calledAt: timestamp("called_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tokens_doctor_day_number_idx").on(
      t.doctorId,
      t.tokenDate,
      t.number,
    ),
    index("tokens_queue_idx").on(t.clinicId, t.tokenDate, t.state),
  ],
);

/**
 * Vitals are stored as a keyed bag rather than fixed columns because the field
 * set is specialty-driven (§7.3) — head circumference for pediatrics, fundal
 * height for obstetrics, RBS/FBS for diabetology. Fixed columns would mean a
 * migration per specialty, which §6 forbids.
 */
export const vitals = pgTable("vitals", {
  ...tenantColumns,

  visitId: uuid("visit_id")
    .notNull()
    .references(() => visits.id),
  recordedByStaffId: uuid("recorded_by_staff_id").references(() => staff.id),

  /* { weightKg: 12.4, tempC: 38.9, ... } — shape defined by the template pack. */
  values: jsonb("values").$type<Record<string, number | string>>().notNull(),

  /*
   * A skipped measurement is a deliberate act, never a silent gap (§8.3 rule 3).
   * Keys land here only via the explicit "Skip a measurement" action.
   */
  skipped: text("skipped").array().notNull().default([]),

  /* Computed at capture time so the chart never re-derives from stale LMS data. */
  percentiles: jsonb("percentiles").notNull().default({}),
});

export const consultations = pgTable("consultations", {
  ...tenantColumns,

  visitId: uuid("visit_id")
    .notNull()
    .references(() => visits.id),
  doctorId: uuid("doctor_id")
    .notNull()
    .references(() => doctors.id),

  diagnosis: text("diagnosis"),
  advice: text("advice"),
  followUpDate: date("follow_up_date"),
});

export const prescriptions = pgTable("prescriptions", {
  ...tenantColumns,

  visitId: uuid("visit_id")
    .notNull()
    .references(() => visits.id),
  doctorId: uuid("doctor_id")
    .notNull()
    .references(() => doctors.id),

  /*
   * Frozen at signing time. The doctor's registration number and the clinic
   * address must reflect what was true when the Rx was issued, not what the
   * profile says today — this is the legally meaningful copy (§9.2).
   */
  issuedSnapshot: jsonb("issued_snapshot").notNull(),

  pdfPath: text("pdf_path"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
});

export const prescriptionItems = pgTable("prescription_items", {
  ...tenantColumns,

  prescriptionId: uuid("prescription_id")
    .notNull()
    .references(() => prescriptions.id),

  /* Null when the doctor prescribed something the clinic does not stock. */
  inventoryItemId: uuid("inventory_item_id"),

  drugName: text("drug_name").notNull(),
  strength: text("strength"),
  dosage: text("dosage").notNull(), // "1-0-1"
  durationDays: integer("duration_days"),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  instructions: text("instructions"),

  /* Flagged on the printed Rx; H1 additionally drives the register (§7.5). */
  scheduleClass: scheduleClassEnum("schedule_class").notNull().default("none"),

  /*
   * Set when the doctor prescribed into a recorded allergy class and
   * consciously overrode the block. The reason is mandatory (§8.3 rule 1).
   */
  allergyOverrideReason: text("allergy_override_reason"),
});
