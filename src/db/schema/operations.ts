import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "./_shared";
import { staff } from "./clinic";
import { visits } from "./visits";

export const taskStateEnum = pgEnum("task_state", [
  "pending",
  "in_progress",
  "done",
  "cancelled",
]);

/** Template list per specialty: IV fluids, nebulisation, dressing, vaccination. */
export const procedures = pgTable("procedures", {
  ...tenantColumns,

  name: text("name").notNull(),
  charge: numeric("charge", { precision: 10, scale: 2 }).notNull().default("0"),

  /* [{ itemId, quantity }] — deducted when the nurse marks the task done. */
  consumables: jsonb("consumables")
    .$type<{ itemId: string; quantity: number }[]>()
    .notNull()
    .default([]),
});

export const procedureTasks = pgTable(
  "procedure_tasks",
  {
    ...tenantColumns,

    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id),

    assignedToStaffId: uuid("assigned_to_staff_id").references(() => staff.id),
    state: taskStateEnum("state").notNull().default("pending"),

    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("procedure_tasks_queue_idx").on(t.clinicId, t.state)],
);

/**
 * MR visits never enter the patient token queue — that separation is the whole
 * point of the module (§7.9).
 */
export const mrCompanies = pgTable("mr_companies", {
  ...tenantColumns,
  name: text("name").notNull(),
});

export const medicalReps = pgTable("medical_reps", {
  ...tenantColumns,

  companyId: uuid("company_id")
    .notNull()
    .references(() => mrCompanies.id),
  name: text("name").notNull(),
  phone: text("phone"),
  division: text("division"),
});

export const mrVisits = pgTable("mr_visits", {
  ...tenantColumns,

  repId: uuid("rep_id")
    .notNull()
    .references(() => medicalReps.id),
  doctorId: uuid("doctor_id").notNull(),

  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  /*
   * Distinct from checkedInAt: a rep who has checked in is "waiting", one
   * the doctor has finished with is "seen" — two different states a front
   * desk and a doctor each act on, so they need their own timestamp rather
   * than overloading one column to mean both.
   */
  seenAt: timestamp("seen_at", { withTimezone: true }),

  /* Private to the doctor — never surfaced to front desk. */
  doctorNotes: text("doctor_notes"),
});

export const attendance = pgTable("attendance", {
  ...tenantColumns,

  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),
  checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull(),
  checkOutAt: timestamp("check_out_at", { withTimezone: true }),
});

/**
 * Every dispense, discount and record edit is attributed (§7.8). Append-only:
 * nothing in the product updates or deletes a row here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    ...tenantColumns,

    actorStaffId: uuid("actor_staff_id").references(() => staff.id),
    action: text("action").notNull(), // dispense | discount | edit_record | override_allergy
    entityTable: text("entity_table").notNull(),
    entityId: uuid("entity_id"),
    detail: jsonb("detail").notNull().default({}),
  },
  (t) => [index("audit_log_clinic_created_idx").on(t.clinicId, t.createdAt)],
);

/**
 * Corrections to clinical/demographic records (§9's editing model).
 *
 * A patient's chart is not a bank ledger — a typo'd DOB or a mis-typed
 * diagnosis must be correctable — but it must never be silently overwritten.
 * Every edit through updatePatientDemographics/amendConsultation writes one
 * row here alongside the update: the values as they were BEFORE this edit,
 * who changed them, and why. The timeline reads this to show "Amended"
 * rather than presenting a correction as if it were the original.
 *
 * One generic table for every correctable entity, matching auditLog's own
 * shape, rather than a revisions table per entity — the read side (render a
 * diff) does not care which table it came from.
 *
 * Deliberately does not cover bills, payments, stock movements, dispense
 * records, or the H1 register — those stay append-only with no edit path at
 * all (void-and-reissue is the correction there), so this table has no
 * reason to ever hold a row for them.
 */
export const recordRevisions = pgTable(
  "record_revisions",
  {
    ...tenantColumns,

    entityTable: text("entity_table").notNull(),
    entityId: uuid("entity_id").notNull(),

    /* Only the fields that changed, keyed by column name — not a full-row
       snapshot, so a revision reads as "what changed" rather than forcing a
       diff against the whole record. */
    previousValues: jsonb("previous_values").notNull(),

    reason: text("reason").notNull(),
    editedByStaffId: uuid("edited_by_staff_id").references(() => staff.id),
  },
  (t) => [
    index("record_revisions_entity_idx").on(t.entityTable, t.entityId, t.createdAt),
  ],
);

export const waMessages = pgTable("wa_messages", {
  ...tenantColumns,

  toPhone: text("to_phone").notNull(),
  templateName: text("template_name").notNull(),
  payload: jsonb("payload").notNull().default({}),

  status: text("status").notNull().default("queued"), // queued|sent|delivered|failed
  providerMessageId: text("provider_message_id"),
  failureReason: text("failure_reason"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
