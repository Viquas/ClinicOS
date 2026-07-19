/*
 * Next.js reads .env.local, but bare `dotenv/config` only reads .env — so a
 * seed run outside Next would silently miss the URL the app is using. Load
 * both, .env.local winning, to keep the two in agreement.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { SCHEDULE } from "../lib/clinical/vaccines";
import {
  clinicDaysAgo,
  clinicMonthsAgo,
  clinicToday,
} from "../lib/clinic-date";

/**
 * Seeds the development database with the same scenario the prototype's
 * fixtures described: a Tuesday morning at a pediatric clinic in Hunsur.
 *
 * Deliberately keeps the awkward cases the fixtures had — a real allergy, a
 * near-expiry batch beside a fresher one, an expired batch, a duplicate
 * patient record, a defaulted vaccination visit. Seeding tidy data would hide
 * exactly the states the UI was built to handle.
 *
 * Run with: pnpm db:seed
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

/* Stable UUIDs so re-seeding is idempotent and screens can deep-link. */
const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = {
  sameera: "22222222-0000-0000-0000-000000000001",
  anand: "22222222-0000-0000-0000-000000000002",
  latha: "22222222-0000-0000-0000-000000000003",
  rekha: "22222222-0000-0000-0000-000000000004",
};
const DOCTOR = {
  sameera: "33333333-0000-0000-0000-000000000001",
  anand: "33333333-0000-0000-0000-000000000002",
};
const PATIENT = {
  aarav: "44444444-0000-0000-0000-000000000001",
  diya: "44444444-0000-0000-0000-000000000002",
  lakshmi: "44444444-0000-0000-0000-000000000003",
  manjunath: "44444444-0000-0000-0000-000000000004",
  bhavana: "44444444-0000-0000-0000-000000000005",
  lakshmiDup: "44444444-0000-0000-0000-000000000006",
  nagaraj: "44444444-0000-0000-0000-000000000007",
};
const ITEM = {
  paracetamol: "55555555-0000-0000-0000-000000000001",
  amoxicillin: "55555555-0000-0000-0000-000000000002",
  salbutamol: "55555555-0000-0000-0000-000000000003",
  ondansetron: "55555555-0000-0000-0000-000000000004",
  ors: "55555555-0000-0000-0000-000000000005",
};

/*
 * Everything below is anchored to the clinic's real today rather than a fixed
 * date, so the demo populates whenever it is seeded instead of only on one
 * Tuesday in July 2026. The offsets carry the clinical meaning the old fixed
 * dates encoded: a batch already expired, two expiring soon, ages that put
 * each child at a specific point in the vaccination schedule.
 */
const TODAY = clinicToday();
const daysAgo = clinicDaysAgo;
const monthsAgo = clinicMonthsAgo;

/* Dates of birth drive age, the vaccination schedule and the growth curve, so
   they are named once and every derived date hangs off them. */
const DOB = {
  aarav: monthsAgo(40), // 3 y 4 m
  diya: monthsAgo(85), // 7 y 1 m
  bhavana: monthsAgo(14), // mid-schedule
  nagaraj: daysAgo(46), // ~6 weeks
};

/** A dose given `days` after birth — the schedule is defined in weeks. */
function afterBirth(dob: string, days: number): string {
  const d = new Date(`${dob}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  console.log("seeding...");

  /* Order matters: every table below references clinic_id, and the FK chain
     runs clinics → staff → doctors → patients → visits → tokens. */
  await db
    .insert(schema.clinics)
    .values({
      id: CLINIC,
      name: "Vatsalya Child Care",
      addressLine: "2nd Cross, Hunsur Main Road",
      city: "Mysuru",
      state: "Karnataka",
      pincode: "570017",
      phone: "08212468800",
      ceaRegistrationNo: "KA/CEA/2024/11872",
      gstin: "29ABCDE1234F1Z5",
      isGstRegistered: true,
      primarySpecialty: "pediatrics",
    })
    .onConflictDoNothing();

  await db
    .insert(schema.staff)
    .values([
      {
        id: STAFF.sameera,
        clinicId: CLINIC,
        name: "Dr. Sameera Rahman",
        phone: "9845001122",
        qualification: "MBBS, MD (Paediatrics)",
        roles: ["owner", "doctor"],
      },
      {
        id: STAFF.anand,
        clinicId: CLINIC,
        name: "Dr. Anand Gowda",
        phone: "9845003344",
        qualification: "MBBS",
        roles: ["doctor"],
      },
      {
        id: STAFF.latha,
        clinicId: CLINIC,
        name: "Latha Bai",
        phone: "9845005566",
        qualification: "GNM",
        roles: ["nurse", "front_desk"],
      },
      {
        id: STAFF.rekha,
        clinicId: CLINIC,
        name: "Rekha S",
        phone: "9845007788",
        roles: ["front_desk", "pharmacy"],
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.doctors)
    .values([
      {
        id: DOCTOR.sameera,
        clinicId: CLINIC,
        staffId: STAFF.sameera,
        specialty: "pediatrics",
        registrationNo: "KMC 78412",
        registrationCouncil: "Karnataka Medical Council",
        templatePack: {
          vitals: ["weightKg", "heightCm", "tempC", "spo2"],
          diagnosisFavourites: [
            "Acute viral fever",
            "URTI",
            "Acute gastroenteritis",
            "Wheeze-associated LRTI",
            "Otitis media",
          ],
        },
      },
      {
        id: DOCTOR.anand,
        clinicId: CLINIC,
        staffId: STAFF.anand,
        specialty: "general_medicine",
        /* No registration number — prescribing stays blocked (§9.2). */
        templatePack: { vitals: ["bp", "pulse", "tempC", "spo2", "weightKg"] },
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.patients)
    .values([
      {
        id: PATIENT.aarav,
        clinicId: CLINIC,
        name: "Aarav Prakash",
        phone: "9845012233",
        sex: "male",
        dateOfBirth: DOB.aarav,
        guardianName: "Prakash M",
        allergies: ["Amoxicillin — rash"],
        tags: ["Chronic: asthma"],
        consentGivenAt: monthsAgo(39),
      },
      {
        id: PATIENT.diya,
        clinicId: CLINIC,
        name: "Diya Prakash",
        /* Same phone as her brother — family grouping (§7.1). */
        phone: "9845012233",
        sex: "female",
        dateOfBirth: DOB.diya,
        guardianName: "Prakash M",
        consentGivenAt: monthsAgo(39),
      },
      {
        id: PATIENT.lakshmi,
        clinicId: CLINIC,
        name: "Lakshmi Devi",
        phone: "9902334455",
        sex: "female",
        ageYears: 62,
        allergies: ["Sulfa drugs"],
        tags: ["Chronic: diabetes", "Chronic: hypertension"],
        consentGivenAt: monthsAgo(30),
      },
      {
        /* Near-duplicate of Lakshmi Devi — drives the merge flow. */
        id: PATIENT.lakshmiDup,
        clinicId: CLINIC,
        name: "Lakshmi D",
        phone: "9902334455",
        sex: "female",
        ageYears: 62,
        consentGivenAt: monthsAgo(4),
      },
      {
        id: PATIENT.manjunath,
        clinicId: CLINIC,
        name: "Manjunath S",
        phone: "9741556677",
        sex: "male",
        ageYears: 34,
        consentGivenAt: monthsAgo(8),
      },
      {
        id: PATIENT.bhavana,
        clinicId: CLINIC,
        name: "Bhavana R",
        phone: "9880778899",
        sex: "female",
        dateOfBirth: DOB.bhavana,
        guardianName: "Rekha R",
        tags: ["Vaccination due"],
        consentGivenAt: DOB.bhavana,
      },
      {
        id: PATIENT.nagaraj,
        clinicId: CLINIC,
        name: "Nagaraj K",
        phone: "9448112233",
        sex: "male",
        dateOfBirth: DOB.nagaraj,
        guardianName: "Kavitha N",
        consentGivenAt: DOB.nagaraj,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.inventoryItems)
    .values([
      {
        id: ITEM.paracetamol,
        clinicId: CLINIC,
        name: "Paracetamol Syrup",
        form: "syrup",
        strength: "125mg/5ml",
        unit: "bottle",
        scheduleClass: "none",
        reorderLevel: "10",
        mrpPerUnit: "56.00",
        gstRate: "12",
      },
      {
        id: ITEM.amoxicillin,
        clinicId: CLINIC,
        name: "Amoxicillin Susp.",
        form: "syrup",
        strength: "250mg/5ml",
        unit: "bottle",
        scheduleClass: "h",
        reorderLevel: "8",
        mrpPerUnit: "78.00",
        gstRate: "12",
      },
      {
        id: ITEM.salbutamol,
        clinicId: CLINIC,
        name: "Salbutamol Respules",
        form: "injection",
        strength: "2.5mg",
        unit: "respule",
        scheduleClass: "h",
        reorderLevel: "20",
        mrpPerUnit: "18.00",
        gstRate: "12",
      },
      {
        id: ITEM.ondansetron,
        clinicId: CLINIC,
        name: "Ondansetron",
        form: "tablet",
        strength: "4mg",
        unit: "tab",
        scheduleClass: "h1",
        reorderLevel: "30",
        mrpPerUnit: "8.50",
        gstRate: "12",
      },
      {
        id: ITEM.ors,
        clinicId: CLINIC,
        name: "ORS Sachet",
        form: "consumable",
        unit: "sachet",
        scheduleClass: "none",
        reorderLevel: "25",
        isConsumable: true,
        mrpPerUnit: "22.00",
        gstRate: "5",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.batches)
    .values([
      /* Three states the counter must handle: expired, near-expiry (FEFO
         should pick this), and fresher stock it should pass over. */
      {
        clinicId: CLINIC,
        itemId: ITEM.paracetamol,
        batchNo: "PC-1885",
        expiryDate: daysAgo(18), // already expired — blocks dispensing
        quantityReceived: "24",
        quantityRemaining: "9",
        costPerUnit: "38.50",
        supplierName: "Mysuru Pharma Distributors",
        invoiceNo: "MPD/26-27/0912",
      },
      {
        clinicId: CLINIC,
        itemId: ITEM.paracetamol,
        batchNo: "PC-2291",
        expiryDate: daysAgo(-20), // expiring soon — drives the warning
        quantityReceived: "24",
        quantityRemaining: "6",
        costPerUnit: "38.50",
        supplierName: "Mysuru Pharma Distributors",
        invoiceNo: "MPD/26-27/1044",
      },
      {
        clinicId: CLINIC,
        itemId: ITEM.paracetamol,
        batchNo: "PC-3140",
        expiryDate: monthsAgo(-8),
        quantityReceived: "24",
        quantityRemaining: "24",
        costPerUnit: "39.00",
        supplierName: "Mysuru Pharma Distributors",
        invoiceNo: "MPD/26-27/1184",
      },
      {
        clinicId: CLINIC,
        itemId: ITEM.amoxicillin,
        batchNo: "AM-8801",
        expiryDate: monthsAgo(-6),
        quantityReceived: "12",
        quantityRemaining: "11",
        costPerUnit: "52.00",
      },
      {
        clinicId: CLINIC,
        itemId: ITEM.salbutamol,
        batchNo: "SB-4412",
        expiryDate: monthsAgo(-4),
        quantityReceived: "50",
        quantityRemaining: "4",
        costPerUnit: "11.50",
      },
      {
        clinicId: CLINIC,
        itemId: ITEM.ondansetron,
        batchNo: "ON-1120",
        expiryDate: daysAgo(-13), // expiring soon
        quantityReceived: "100",
        quantityRemaining: "40",
        costPerUnit: "5.20",
      },
      {
        clinicId: CLINIC,
        itemId: ITEM.ors,
        batchNo: "OR-7781",
        expiryDate: monthsAgo(-19),
        quantityReceived: "100",
        quantityRemaining: "62",
        costPerUnit: "14.00",
      },
    ])
    .onConflictDoNothing();

  /* Today's queue — parallel per-doctor token sequences. */
  const visitRows = [
    { patientId: PATIENT.aarav, doctorId: DOCTOR.sameera, number: 12, state: "with_doctor" as const, priority: false, waitedMinutes: 34 },
    { patientId: PATIENT.bhavana, doctorId: DOCTOR.sameera, number: 13, state: "vitals_done" as const, priority: false, waitedMinutes: 8 },
    { patientId: PATIENT.diya, doctorId: DOCTOR.sameera, number: 14, state: "waiting" as const, priority: true, waitedMinutes: 3 },
    { patientId: PATIENT.lakshmi, doctorId: DOCTOR.sameera, number: 15, state: "waiting" as const, priority: false, waitedMinutes: 21 },
    { patientId: PATIENT.manjunath, doctorId: DOCTOR.anand, number: 7, state: "at_pharmacy" as const, priority: false, waitedMinutes: 46 },
    { patientId: PATIENT.nagaraj, doctorId: DOCTOR.anand, number: 8, state: "waiting" as const, priority: false, waitedMinutes: 14 },
  ];

  /* Captured so the pharmacy screen has a real prescription to dispense. */
  let pharmacyVisitId: string | null = null;
  /* Captured so procedure tasks can attach to a real visit per patient. */
  const visitIdByPatient = new Map<string, string>();

  for (const row of visitRows) {
    const [visit] = await db
      .insert(schema.visits)
      .values({
        clinicId: CLINIC,
        patientId: row.patientId,
        doctorId: row.doctorId,
        visitDate: TODAY,
      })
      .returning({ id: schema.visits.id });

    if (row.state === "at_pharmacy") pharmacyVisitId = visit.id;
    visitIdByPatient.set(row.patientId, visit.id);

    /*
     * Stagger arrival times so "waiting 21m" on the queue means something.
     * Left at the column default, every token would share one timestamp and
     * every wait would read as zero — which looks like a broken clock rather
     * than a fresh queue.
     */
    await db.insert(schema.tokens).values({
      clinicId: CLINIC,
      visitId: visit.id,
      doctorId: row.doctorId,
      tokenDate: TODAY,
      number: row.number,
      state: row.state,
      isPriority: row.priority,
      createdAt: new Date(Date.now() - row.waitedMinutes * 60_000),
    });

    if (row.state !== "waiting") {
      await db.insert(schema.vitals).values({
        clinicId: CLINIC,
        visitId: visit.id,
        recordedByStaffId: STAFF.latha,
        values:
          row.patientId === PATIENT.aarav
            ? { tempC: 38.9, weightKg: 14.2, spo2: 97 }
            : row.patientId === PATIENT.bhavana
              ? { tempC: 37.1, weightKg: 8.9, heightCm: 76 }
              : { bp: "148/94", pulse: 88 },
      });
    }
  }

  /*
   * Prior well-child visits, so the growth trend has a curve to draw.
   *
   * Without these the Trends tab is unreachable: it needs two weighed visits
   * and every patient had exactly one, so the flagship pediatric feature
   * rendered its empty state for every child in the clinic — the feature was
   * built and shipped behind data that could never satisfy it.
   *
   * Weights track the IAP growth reference for each child's age at the time
   * rather than being decorative: a growth chart seeded with implausible
   * gains teaches a doctor to distrust the curve.
   */
  const priorVisits: {
    patientId: string;
    doctorId: string;
    date: string;
    vitals: Record<string, number | string>;
    diagnosis: string;
    advice: string;
    followUpDate: string | null;
  }[] = [
    /* Aarav — 3 y 4 m today at 14.2 kg. Asthma is his chronic tag, so his
       history is the mix a real asthmatic toddler generates: routine checks
       punctuated by wheeze episodes. */
    {
      patientId: PATIENT.aarav, doctorId: DOCTOR.sameera, date: monthsAgo(12),
      vitals: { weightKg: 12.4, heightCm: 88, tempC: 36.8 },
      diagnosis: "Well-child visit", advice: "Growth on track. Continue current diet.", followUpDate: monthsAgo(8),
    },
    {
      patientId: PATIENT.aarav, doctorId: DOCTOR.sameera, date: monthsAgo(8),
      vitals: { weightKg: 13.1, heightCm: 91, tempC: 36.9 },
      diagnosis: "Mild intermittent asthma — review", advice: "Continue inhaled budesonide. Spacer technique reviewed with mother.", followUpDate: monthsAgo(4),
    },
    {
      patientId: PATIENT.aarav, doctorId: DOCTOR.sameera, date: monthsAgo(4),
      vitals: { weightKg: 13.6, heightCm: 94, tempC: 37.0 },
      diagnosis: "Well-child visit", advice: "No wheeze since last visit. Step down review in six months.", followUpDate: null,
    },
    /* Bhavana — 14 m today at 8.9 kg. */
    {
      patientId: PATIENT.bhavana, doctorId: DOCTOR.sameera, date: monthsAgo(8),
      vitals: { weightKg: 7.2, heightCm: 66, tempC: 36.7 },
      diagnosis: "Well-child visit — 6 months", advice: "Start complementary feeding. Continue breastfeeding on demand.", followUpDate: monthsAgo(5),
    },
    {
      patientId: PATIENT.bhavana, doctorId: DOCTOR.sameera, date: monthsAgo(5),
      vitals: { weightKg: 8.0, heightCm: 71, tempC: 36.8 },
      diagnosis: "Acute gastroenteritis", advice: "ORS after each loose stool. Return if unable to keep fluids down.", followUpDate: null,
    },
    /* Diya — seen a week ago for fever, told to come back today for review.
       She is also in today's live queue (see visitRows above); without this,
       the doctor's "follow-ups due today" home section had nothing seeded
       that ever lands on TODAY, so it would always render empty regardless
       of who was signed in — the same starved-data gap as the growth trends
       and consultations fixes earlier in this project. */
    {
      patientId: PATIENT.diya, doctorId: DOCTOR.sameera, date: daysAgo(7),
      vitals: { tempC: 39.1, weightKg: 11.8 },
      diagnosis: "Viral fever", advice: "Paracetamol SOS, plenty of fluids. Review in a week if fever persists.", followUpDate: TODAY,
    },
  ];

  for (const prior of priorVisits) {
    const [visit] = await db
      .insert(schema.visits)
      .values({
        clinicId: CLINIC,
        patientId: prior.patientId,
        doctorId: prior.doctorId,
        visitDate: prior.date,
      })
      .returning({ id: schema.visits.id });

    await db.insert(schema.vitals).values({
      clinicId: CLINIC,
      visitId: visit.id,
      recordedByStaffId: STAFF.latha,
      values: prior.vitals,
    });

    /*
     * The consultations table had no seed rows at all, so every timeline
     * entry in the product rendered "Visit — no diagnosis recorded" and the
     * advice and follow-up branches of the timeline card were unreachable —
     * three display paths that existed but nothing could ever exercise.
     */
    await db.insert(schema.consultations).values({
      clinicId: CLINIC,
      visitId: visit.id,
      doctorId: prior.doctorId,
      diagnosis: prior.diagnosis,
      advice: prior.advice,
      followUpDate: prior.followUpDate,
    });
  }

  /*
   * Attachments on the patient record.
   *
   * IMPORTANT — this table has no write path in the product: there is no
   * upload mutation and no upload control on the Files tab, so nothing the
   * app does can ever create one of these rows. These seeds exist so the
   * read side is demonstrable, not because the feature is finished.
   *
   * storagePath follows the convention the real uploader would use, but the
   * objects do not exist: file bytes need Supabase Storage, which is
   * deliberately out of scope alongside auth. Wiring uploads means building
   * the storage client, the upload action, and a signed-URL read path — do
   * not read these rows as evidence any of that exists.
   */
  await db.insert(schema.patientFiles).values([
    {
      clinicId: CLINIC,
      patientId: PATIENT.aarav,
      kind: "lab_report",
      label: "CBC — Mysuru Diagnostics",
      storagePath: `${CLINIC}/${PATIENT.aarav}/cbc-2026-03-10.pdf`,
      uploadedByStaffId: STAFF.latha,
      createdAt: new Date(`${monthsAgo(4)}T11:20:00+05:30`),
    },
    {
      clinicId: CLINIC,
      patientId: PATIENT.aarav,
      kind: "external_rx",
      label: "Prescription from ENT consult",
      storagePath: `${CLINIC}/${PATIENT.aarav}/ent-rx-2025-11-20.jpg`,
      uploadedByStaffId: STAFF.rekha,
      createdAt: new Date(`${monthsAgo(8)}T16:05:00+05:30`),
    },
    {
      clinicId: CLINIC,
      patientId: PATIENT.bhavana,
      kind: "photo",
      label: "Rash on forearm",
      storagePath: `${CLINIC}/${PATIENT.bhavana}/rash-2026-02-18.jpg`,
      uploadedByStaffId: STAFF.latha,
      createdAt: new Date(`${monthsAgo(5)}T10:40:00+05:30`),
    },
  ]);

  /*
   * A prescription on the at-pharmacy visit, so the pharmacy screen dispenses
   * against real lines. Manjunath is under Dr Anand; the lines are Schedule H
   * and none, not H1, because Anand has no registration number and an H1
   * dispense should not be demoed under an incomplete prescriber.
   */
  if (pharmacyVisitId) {
    const [rx] = await db
      .insert(schema.prescriptions)
      .values({
        clinicId: CLINIC,
        visitId: pharmacyVisitId,
        doctorId: DOCTOR.anand,
        issuedSnapshot: {
          doctorName: "Dr. Anand Gowda",
          clinicName: "Vatsalya Child Care",
        },
        signedAt: new Date(),
      })
      .returning({ id: schema.prescriptions.id });

    await db.insert(schema.prescriptionItems).values([
      {
        clinicId: CLINIC,
        prescriptionId: rx.id,
        inventoryItemId: ITEM.paracetamol,
        drugName: "Paracetamol Syrup",
        strength: "125mg/5ml",
        dosage: "1-0-1",
        durationDays: 3,
        quantity: "1",
        scheduleClass: "none",
      },
      {
        clinicId: CLINIC,
        prescriptionId: rx.id,
        inventoryItemId: ITEM.amoxicillin,
        drugName: "Amoxicillin Susp.",
        strength: "250mg/5ml",
        dosage: "1-0-1",
        durationDays: 5,
        quantity: "1",
        scheduleClass: "h",
      },
    ]);
  }

  /*
   * Procedures and nursing tasks (§7.6). Consumables reference real formulary
   * items so completing a task genuinely deducts stock, the same as a
   * pharmacy dispense — this is the other place medicine leaves the shelf.
   */
  const [nebulisation] = await db
    .insert(schema.procedures)
    .values({
      clinicId: CLINIC,
      name: "Nebulisation",
      charge: "150.00",
      consumables: [{ itemId: ITEM.salbutamol, quantity: 1 }],
    })
    .returning({ id: schema.procedures.id });

  const [orsTherapy] = await db
    .insert(schema.procedures)
    .values({
      clinicId: CLINIC,
      name: "ORS Therapy",
      charge: "50.00",
      consumables: [{ itemId: ITEM.ors, quantity: 2 }],
    })
    .returning({ id: schema.procedures.id });

  const aaravVisitId = visitIdByPatient.get(PATIENT.aarav);
  const bhavanaVisitId = visitIdByPatient.get(PATIENT.bhavana);

  if (aaravVisitId) {
    /* Pending — matches Aarav's fever + asthma history; drives the "start,
       then complete" flow and the FEFO consumable deduction on completion. */
    await db.insert(schema.procedureTasks).values({
      clinicId: CLINIC,
      visitId: aaravVisitId,
      procedureId: nebulisation.id,
      state: "pending",
      notes: "2.5mg, repeat after 20 min if wheeze persists",
    });
  }

  if (bhavanaVisitId) {
    /* Already completed, with a matching ledger entry — so the seeded history
       is internally consistent rather than a "done" task nothing deducted. */
    const [orsBatch] = await db
      .select({ id: schema.batches.id })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.clinicId, CLINIC),
          eq(schema.batches.batchNo, "OR-7781"),
        ),
      );

    const [task] = await db
      .insert(schema.procedureTasks)
      .values({
        clinicId: CLINIC,
        visitId: bhavanaVisitId,
        procedureId: orsTherapy.id,
        assignedToStaffId: STAFF.latha,
        state: "done",
        completedAt: new Date(),
      })
      .returning({ id: schema.procedureTasks.id });

    if (orsBatch) {
      await db.insert(schema.stockMovements).values({
        clinicId: CLINIC,
        batchId: orsBatch.id,
        kind: "dispense",
        quantityDelta: "-2",
        procedureTaskId: task.id,
        byStaffId: STAFF.latha,
      });
      await db
        .update(schema.batches)
        .set({ quantityRemaining: sql`${schema.batches.quantityRemaining} - 2` })
        .where(eq(schema.batches.id, orsBatch.id));
    }
  }

  /*
   * Vaccination (§7.6 P1) — each schedule antigen becomes a procedure row, so
   * recording a dose given goes through the same nurse task lifecycle as any
   * other procedure. A dose is "given" precisely when a completed
   * procedure_task references one of these by name.
   */
  const vaccineProcedureIdByName = new Map<string, string>();
  for (const dose of SCHEDULE) {
    const [row] = await db
      .insert(schema.procedures)
      .values({
        clinicId: CLINIC,
        name: dose.name,
        charge: "0.00",
        consumables: [],
      })
      .returning({ id: schema.procedures.id });
    vaccineProcedureIdByName.set(dose.name, row.id);
  }

  /*
   * Bhavana is on schedule with her birth doses given, and otherwise due —
   * she is 14 months old (§7.6 P1's "who do we chase this week" case). Real
   * completed procedure_tasks, not a fixture: the roster the vaccinations
   * screen reads is computed from these rows the same way the pharmacy and
   * billing screens read from real dispenses.
   */
  if (bhavanaVisitId) {
    const bhavanaDob = DOB.bhavana;
    for (const doseName of ["BCG", "Hepatitis B — birth", "OPV — 0"]) {
      const procId = vaccineProcedureIdByName.get(doseName);
      if (!procId) continue;

      await db.insert(schema.procedureTasks).values({
        clinicId: CLINIC,
        visitId: bhavanaVisitId,
        procedureId: procId,
        assignedToStaffId: STAFF.latha,
        state: "done",
        completedAt: new Date(`${bhavanaDob}T09:00:00Z`),
      });
    }
  }

  /*
   * Aarav is the "genuinely behind, but weeks behind" case —
   * complete through the 10-week visit, then defaulted. Without this, every
   * one of his 21 doses reads as un-given and the due-list shows him three
   * YEARS overdue on all of them, which is precisely the case the module's
   * own design note warns is not what the due-list is for: it makes the
   * screen look broken rather than useful.
   */
  if (aaravVisitId) {
    const aaravDoses: [string, string][] = [
      /* Birth doses, then 6-week and 10-week visits — then he defaults. */
      ["BCG", afterBirth(DOB.aarav, 0)],
      ["Hepatitis B — birth", afterBirth(DOB.aarav, 0)],
      ["OPV — 0", afterBirth(DOB.aarav, 0)],
      ["Pentavalent 1", afterBirth(DOB.aarav, 42)],
      ["OPV 1", afterBirth(DOB.aarav, 42)],
      ["Rotavirus 1", afterBirth(DOB.aarav, 42)],
      ["PCV 1", afterBirth(DOB.aarav, 42)],
      ["Pentavalent 2", afterBirth(DOB.aarav, 70)],
      ["OPV 2", afterBirth(DOB.aarav, 70)],
      ["Rotavirus 2", afterBirth(DOB.aarav, 70)],
      ["PCV 2", afterBirth(DOB.aarav, 70)],
    ];

    for (const [doseName, givenOn] of aaravDoses) {
      const procId = vaccineProcedureIdByName.get(doseName);
      if (!procId) continue;

      await db.insert(schema.procedureTasks).values({
        clinicId: CLINIC,
        visitId: aaravVisitId,
        procedureId: procId,
        assignedToStaffId: STAFF.latha,
        state: "done",
        completedAt: new Date(`${givenOn}T09:00:00Z`),
      });
    }
  }

  /*
   * Medical rep queue (§7.9) — deliberately separate from the patient token
   * sequence tables above. Three real states so the screen demonstrates all
   * of them: booked (not yet arrived), waiting (checked in), seen.
   */
  const [cipla] = await db
    .insert(schema.mrCompanies)
    .values({ clinicId: CLINIC, name: "Cipla" })
    .returning({ id: schema.mrCompanies.id });
  const [mankind] = await db
    .insert(schema.mrCompanies)
    .values({ clinicId: CLINIC, name: "Mankind" })
    .returning({ id: schema.mrCompanies.id });
  const [alkem] = await db
    .insert(schema.mrCompanies)
    .values({ clinicId: CLINIC, name: "Alkem" })
    .returning({ id: schema.mrCompanies.id });

  const [kiran] = await db
    .insert(schema.medicalReps)
    .values({
      clinicId: CLINIC,
      companyId: cipla.id,
      name: "Kiran Shetty",
      phone: "9900011122",
      division: "Respiratory",
    })
    .returning({ id: schema.medicalReps.id });
  const [priya] = await db
    .insert(schema.medicalReps)
    .values({
      clinicId: CLINIC,
      companyId: mankind.id,
      name: "Priya Nair",
      phone: "9900033344",
      division: "Paediatric",
    })
    .returning({ id: schema.medicalReps.id });
  const [anilRep] = await db
    .insert(schema.medicalReps)
    .values({
      clinicId: CLINIC,
      companyId: alkem.id,
      name: "Anil Kumar",
      phone: "9900055566",
      division: "Anti-infectives",
    })
    .returning({ id: schema.medicalReps.id });

  const now = Date.now();
  await db.insert(schema.mrVisits).values([
    {
      /* Checked in 12 minutes ago — waiting. */
      clinicId: CLINIC,
      repId: kiran.id,
      doctorId: DOCTOR.sameera,
      scheduledFor: new Date(`${TODAY}T14:00:00+05:30`),
      checkedInAt: new Date(now - 12 * 60_000),
    },
    {
      /* Booked for later today, not yet arrived. */
      clinicId: CLINIC,
      repId: priya.id,
      doctorId: DOCTOR.sameera,
      scheduledFor: new Date(`${TODAY}T14:15:00+05:30`),
    },
    {
      /* Seen earlier this morning — the doctor's private note stays off the
         front-desk-visible queue entirely (query layer, not just UI). */
      clinicId: CLINIC,
      repId: anilRep.id,
      doctorId: DOCTOR.anand,
      scheduledFor: new Date(`${TODAY}T09:30:00+05:30`),
      checkedInAt: new Date(`${TODAY}T09:32:00+05:30`),
      seenAt: new Date(`${TODAY}T09:45:00+05:30`),
      doctorNotes: "Asked about the new inhaler combination — send literature",
    },
    {
      /* A prior visit for Kiran, so "last visit" has something real to show. */
      clinicId: CLINIC,
      repId: kiran.id,
      doctorId: DOCTOR.sameera,
      scheduledFor: new Date(`${monthsAgo(2)}T14:00:00+05:30`),
      checkedInAt: new Date(`${monthsAgo(2)}T14:05:00+05:30`),
      seenAt: new Date(`${monthsAgo(2)}T14:20:00+05:30`),
    },
  ]);

  console.log("seeded.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
