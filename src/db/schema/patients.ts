import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { sexEnum, tenantColumns } from "./_shared";

/**
 * One phone number holds several people — the parent's phone with the child's
 * record is the pediatric default, not an edge case (§7.1). So `phone` is
 * deliberately not unique; the (clinic, phone) index is the search path.
 */
export const patients = pgTable(
  "patients",
  {
    ...tenantColumns,

    name: text("name").notNull(),
    phone: text("phone").notNull(),
    sex: sexEnum("sex").notNull(),

    /* Either may be null: rural patients often know the year, not the date. */
    dateOfBirth: date("date_of_birth"),
    ageYears: integer("age_years"),

    guardianName: text("guardian_name"),

    /*
     * Allergies render above everything else on the chart and travel to the
     * prescription screen as a pinned banner (§8.3 rule 1). Kept on the patient
     * rather than the visit because they outlive any single visit.
     */
    allergies: jsonb("allergies").$type<string[]>().notNull().default([]),

    /* Clinic-defined: referral source, area/village for catchment analysis. */
    customFields: jsonb("custom_fields").notNull().default({}),
    tags: text("tags").array().notNull().default([]),

    /* DPDP Act 2023 — consent captured at registration (§9.1). */
    consentGivenAt: date("consent_given_at"),

    /* ABDM comes in P2; identity must stay mappable to it from day one. */
    abhaAddress: text("abha_address"),

    /* Points at the surviving record after a duplicate merge (§7.1). */
    mergedIntoId: uuid("merged_into_id"),
  },
  (t) => [
    index("patients_clinic_phone_idx").on(t.clinicId, t.phone),
    index("patients_clinic_name_idx").on(t.clinicId, t.name),
  ],
);

export const patientFiles = pgTable("patient_files", {
  ...tenantColumns,

  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  visitId: uuid("visit_id"),

  kind: text("kind").notNull(), // lab_report | external_rx | photo
  label: text("label"),
  storagePath: text("storage_path").notNull(),
  uploadedByStaffId: uuid("uploaded_by_staff_id"),
});
