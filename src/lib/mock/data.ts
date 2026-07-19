/**
 * Prototype fixtures. No backend — every screen reads from here.
 *
 * Deliberately shaped like a real Tuesday morning at a pediatric clinic in
 * Hunsur (§14 wedge specialty): parallel doctor queues, one priority insert,
 * a real allergy, a near-expiry batch, and a partially-stocked prescription.
 * Prototypes built on tidy data hide exactly the cases the design must handle.
 */

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  qualification: string;
  registrationNo: string;
};

export const doctors: Doctor[] = [
  {
    id: "d1",
    name: "Dr. Sameera Rahman",
    specialty: "Pediatrics",
    qualification: "MBBS, MD (Paediatrics)",
    registrationNo: "KMC 78412",
  },
  {
    id: "d2",
    name: "Dr. Anand Gowda",
    specialty: "General Medicine",
    qualification: "MBBS",
    registrationNo: "KMC 61209",
  },
];

export type TokenState =
  | "waiting"
  | "vitals_done"
  | "with_doctor"
  | "at_pharmacy"
  | "billed"
  | "closed";

export type QueueEntry = {
  tokenId: string;
  number: number;
  doctorId: string;
  state: TokenState;
  isPriority: boolean;
  patient: Patient;
  vitals?: Record<string, string>;
  waitingMinutes: number;
};

export type Patient = {
  id: string;
  name: string;
  phone: string;
  ageLabel: string;
  ageMonths?: number;
  sex: "Male" | "Female";
  guardianName?: string;
  allergies: string[];
  tags: string[];
  weightKg?: number;
};

export const patients: Patient[] = [
  {
    id: "p1",
    name: "Aarav Prakash",
    phone: "9845012233",
    ageLabel: "3 y 4 m",
    ageMonths: 40,
    sex: "Male",
    guardianName: "Prakash M",
    allergies: ["Amoxicillin — rash"],
    tags: ["Chronic: asthma"],
    weightKg: 14.2,
  },
  {
    id: "p2",
    name: "Diya Prakash",
    phone: "9845012233", // same phone as her brother — family grouping (§7.1)
    ageLabel: "7 y 1 m",
    ageMonths: 85,
    sex: "Female",
    guardianName: "Prakash M",
    allergies: [],
    tags: [],
    weightKg: 21.6,
  },
  {
    id: "p3",
    name: "Lakshmi Devi",
    phone: "9902334455",
    ageLabel: "62 y",
    sex: "Female",
    allergies: ["Sulfa drugs"],
    tags: ["Chronic: diabetes", "Chronic: hypertension"],
    weightKg: 58.0,
  },
  {
    id: "p4",
    name: "Manjunath S",
    phone: "9741556677",
    ageLabel: "34 y",
    sex: "Male",
    allergies: [],
    tags: [],
    weightKg: 71.5,
  },
  {
    id: "p5",
    name: "Bhavana R",
    phone: "9880778899",
    ageLabel: "1 y 2 m",
    ageMonths: 14,
    sex: "Female",
    guardianName: "Rekha R",
    allergies: [],
    tags: ["Vaccination due"],
    weightKg: 8.9,
  },
  {
    /*
     * A near-duplicate of p3, created because front desk typed the name
     * differently on a busy morning. Same phone, same age, same sex — the
     * signature of a real duplicate rather than a genuine family member
     * (who would differ on age or sex). Drives the merge flow in §7.1.
     */
    id: "p6",
    name: "Lakshmi D",
    phone: "9902334455",
    ageLabel: "62 y",
    sex: "Female",
    allergies: [],
    tags: [],
  },
  {
    id: "p7",
    name: "Suresh Babu",
    phone: "9663445566",
    ageLabel: "45 y",
    sex: "Male",
    allergies: ["Ibuprofen"],
    tags: ["Chronic: hypertension"],
    weightKg: 78.2,
  },
  {
    id: "p8",
    name: "Nagaraj K",
    phone: "9448112233",
    ageLabel: "8 y 6 m",
    ageMonths: 102,
    sex: "Male",
    guardianName: "Kavitha N",
    allergies: [],
    tags: [],
    weightKg: 24.1,
  },
];

const byId = (id: string) => patients.find((p) => p.id === id)!;

export const queue: QueueEntry[] = [
  {
    tokenId: "t1",
    number: 12,
    doctorId: "d1",
    state: "with_doctor",
    isPriority: false,
    patient: byId("p1"),
    vitals: { "Temp": "38.9 °C", "Weight": "14.2 kg", "SpO₂": "97%" },
    waitingMinutes: 0,
  },
  {
    tokenId: "t2",
    number: 13,
    doctorId: "d1",
    state: "vitals_done",
    isPriority: false,
    patient: byId("p5"),
    vitals: { "Temp": "37.1 °C", "Weight": "8.9 kg", "Height": "76 cm" },
    waitingMinutes: 8,
  },
  {
    tokenId: "t3",
    number: 14,
    doctorId: "d1",
    state: "waiting",
    isPriority: true,
    patient: byId("p2"),
    waitingMinutes: 3,
  },
  {
    tokenId: "t4",
    number: 15,
    doctorId: "d1",
    state: "waiting",
    isPriority: false,
    patient: byId("p3"),
    waitingMinutes: 21,
  },
  {
    tokenId: "t5",
    number: 7,
    doctorId: "d2",
    state: "at_pharmacy",
    isPriority: false,
    patient: byId("p4"),
    vitals: { "BP": "148/94", "Pulse": "88" },
    waitingMinutes: 0,
  },
  {
    tokenId: "t6",
    number: 8,
    doctorId: "d2",
    state: "waiting",
    isPriority: false,
    patient: byId("p3"),
    waitingMinutes: 14,
  },
];

export type Batch = {
  id: string;
  batchNo: string;
  expiryDate: string;
  quantityRemaining: number;
};

export type InventoryItem = {
  id: string;
  name: string;
  form: string;
  strength?: string;
  unit: string;
  scheduleClass: "none" | "h" | "h1";
  reorderLevel: number;
  batches: Batch[];
};

export const inventory: InventoryItem[] = [
  {
    id: "i1",
    name: "Paracetamol Syrup",
    form: "syrup",
    strength: "125mg/5ml",
    unit: "bottle",
    scheduleClass: "none",
    reorderLevel: 10,
    batches: [
      /*
       * Three batches covering all three states the counter must handle:
       * an expired batch that is visibly blocked, the near-expiry batch FEFO
       * should pick, and a fresher one it should pass over.
       */
      { id: "b0", batchNo: "PC-1885", expiryDate: "2026-06-30", quantityRemaining: 9 },
      { id: "b1", batchNo: "PC-2291", expiryDate: "2026-08-07", quantityRemaining: 6 },
      { id: "b2", batchNo: "PC-3140", expiryDate: "2027-03-31", quantityRemaining: 24 },
    ],
  },
  {
    id: "i2",
    name: "Amoxicillin Susp.",
    form: "syrup",
    strength: "250mg/5ml",
    unit: "bottle",
    scheduleClass: "h",
    reorderLevel: 8,
    batches: [
      { id: "b3", batchNo: "AM-8801", expiryDate: "2027-01-31", quantityRemaining: 11 },
    ],
  },
  {
    id: "i3",
    name: "Salbutamol Respules",
    form: "injection",
    strength: "2.5mg",
    unit: "respule",
    scheduleClass: "h",
    reorderLevel: 20,
    batches: [
      { id: "b4", batchNo: "SB-4412", expiryDate: "2026-11-30", quantityRemaining: 4 },
    ],
  },
  {
    id: "i4",
    name: "Ondansetron",
    form: "tablet",
    strength: "4mg",
    unit: "tab",
    scheduleClass: "h1",
    reorderLevel: 30,
    batches: [
      { id: "b5", batchNo: "ON-1120", expiryDate: "2026-07-31", quantityRemaining: 40 },
    ],
  },
  {
    id: "i5",
    name: "ORS Sachet",
    form: "consumable",
    unit: "sachet",
    scheduleClass: "none",
    reorderLevel: 25,
    batches: [
      { id: "b6", batchNo: "OR-7781", expiryDate: "2028-02-28", quantityRemaining: 62 },
    ],
  },
];

export const clinic = {
  name: "Vatsalya Child Care",
  addressLine: "2nd Cross, Hunsur Main Road",
  city: "Mysuru, Karnataka",
  ceaRegistrationNo: "KA/CEA/2024/11872",
};

/** Fixed date so the prototype's expiry maths stay stable across sessions. */
export const TODAY = new Date("2026-07-18T09:30:00+05:30");
