import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { staffRoleEnum, tenantColumns } from "./_shared";

export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  phone: text("phone"),
  logoUrl: text("logo_url"),

  /* Clinical Establishments Act registration — printed where states require it. */
  ceaRegistrationNo: text("cea_registration_no"),

  /* GST posture decides whether bills split service vs goods lines (§7.7). */
  gstin: text("gstin"),
  isGstRegistered: boolean("is_gst_registered").notNull().default(false),

  /* Onboarding wizard seeds templates from this (§7.12). */
  primarySpecialty: text("primary_specialty"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const staff = pgTable("staff", {
  ...tenantColumns,

  /* Maps to auth.users. Null until the invite is accepted. */
  authUserId: uuid("auth_user_id"),

  name: text("name").notNull(),
  phone: text("phone").notNull(),
  qualification: text("qualification"),

  /* Role stacking — a 2-person clinic runs front desk + pharmacy on one login. */
  roles: staffRoleEnum("roles").array().notNull(),

  /* Fast user-switching on shared devices (§7.12). Hashed, never plaintext. */
  pinHash: text("pin_hash"),

  isActive: boolean("is_active").notNull().default(true),
});

/**
 * Doctors are a subset of staff. Split out because a prescription is legally
 * invalid without registration details (§9.2) — we block prescription
 * generation until `registrationNo` and `qualification` are present.
 */
export const doctors = pgTable("doctors", {
  ...tenantColumns,

  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),

  specialty: text("specialty").notNull(),

  /* State medical council registration number — required on every Rx. */
  registrationNo: text("registration_no"),
  registrationCouncil: text("registration_council"),
  signatureUrl: text("signature_url"),

  /*
   * The specialty template pack: vitals fields, prescription favourites,
   * procedure list, reminder flows. Specialty differences live here as data,
   * never as a code fork (§6 design rule).
   */
  templatePack: jsonb("template_pack").notNull().default({}),
});
