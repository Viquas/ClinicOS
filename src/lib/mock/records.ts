/**
 * Fixtures for the longitudinal record, nursing tasks, staff and audit trail.
 *
 * Kept separate from data.ts so the queue/pharmacy fixtures stay readable.
 * The history below is deliberately uneven — a missed follow-up, one visit
 * with no prescription, a partially-dispensed line. Clean history hides the
 * states a real timeline has to render.
 */

export type TimelineEntry = {
  id: string;
  patientId: string;
  date: string;
  doctor: string;
  diagnosis: string;
  vitals?: Record<string, string>;
  prescription?: string[];
  procedures?: string[];
  billPaise?: number;
  followUpDate?: string;
  followUpMissed?: boolean;
  note?: string;
};

export const timeline: TimelineEntry[] = [
  {
    id: "v1",
    patientId: "p1",
    date: "2026-07-18",
    doctor: "Dr. Sameera Rahman",
    diagnosis: "Acute viral fever",
    vitals: { Temp: "38.9 °C", Weight: "14.2 kg", "SpO₂": "97%" },
    prescription: ["Paracetamol Syrup — 1-0-1 × 3 days", "ORS Sachet — SOS"],
    billPaise: 50600,
    followUpDate: "2026-07-21",
  },
  {
    id: "v2",
    patientId: "p1",
    date: "2026-05-12",
    doctor: "Dr. Sameera Rahman",
    diagnosis: "Wheeze-associated LRTI",
    vitals: { Temp: "37.4 °C", Weight: "13.8 kg", "SpO₂": "94%" },
    prescription: ["Salbutamol Respules — TDS × 5 days"],
    procedures: ["Nebulisation"],
    billPaise: 68000,
    followUpDate: "2026-05-15",
    followUpMissed: true,
  },
  {
    id: "v3",
    patientId: "p1",
    date: "2026-03-02",
    doctor: "Dr. Anand Gowda",
    diagnosis: "Follow-up — asthma review",
    vitals: { Weight: "13.1 kg" },
    /* No prescription: a review visit. The timeline must render this without
       looking like data is missing. */
    billPaise: 30000,
    note: "Advised to continue inhaler. Parent counselled on trigger avoidance.",
  },
  {
    id: "v4",
    patientId: "p1",
    date: "2025-11-19",
    doctor: "Dr. Sameera Rahman",
    diagnosis: "Acute gastroenteritis",
    vitals: { Temp: "38.1 °C", Weight: "12.4 kg" },
    prescription: ["ORS Sachet — after each loose stool", "Zinc — OD × 14 days"],
    billPaise: 42500,
  },
];

export type PatientFile = {
  id: string;
  patientId: string;
  label: string;
  kind: "lab_report" | "external_rx" | "photo";
  date: string;
  sizeLabel: string;
};

export const patientFiles: PatientFile[] = [
  {
    id: "f1",
    patientId: "p1",
    label: "Chest X-ray — Mysuru Diagnostics",
    kind: "lab_report",
    date: "2026-05-12",
    sizeLabel: "1.2 MB",
  },
  {
    id: "f2",
    patientId: "p1",
    label: "CBC report",
    kind: "lab_report",
    date: "2026-05-11",
    sizeLabel: "340 KB",
  },
  {
    id: "f3",
    patientId: "p1",
    label: "Rash — right forearm",
    kind: "photo",
    date: "2025-08-02",
    sizeLabel: "820 KB",
  },
];

export type NursingTask = {
  id: string;
  tokenNumber: number;
  patientName: string;
  patientAge: string;
  procedure: string;
  notes?: string;
  consumables: string[];
  state: "pending" | "in_progress" | "done";
  assignedTo?: string;
  orderedBy: string;
  orderedAt: string;
};

export const nursingTasks: NursingTask[] = [
  {
    id: "t1",
    tokenNumber: 12,
    patientName: "Aarav Prakash",
    patientAge: "3 y 4 m",
    procedure: "Nebulisation",
    notes: "Salbutamol 2.5mg, repeat after 20 min if wheeze persists",
    consumables: ["Salbutamol Respules × 1", "Nebuliser mask × 1"],
    state: "in_progress",
    assignedTo: "Sr. Latha",
    orderedBy: "Dr. Sameera Rahman",
    orderedAt: "09:42",
  },
  {
    id: "t2",
    tokenNumber: 7,
    patientName: "Manjunath S",
    patientAge: "34 y",
    procedure: "IV fluids",
    notes: "NS 500ml over 2 hours",
    consumables: ["IV set × 1", "NS 500ml × 1", "Cannula 20G × 1"],
    state: "pending",
    orderedBy: "Dr. Anand Gowda",
    orderedAt: "09:51",
  },
  {
    id: "t3",
    tokenNumber: 13,
    patientName: "Bhavana R",
    patientAge: "1 y 2 m",
    procedure: "Vaccination — Pentavalent 3",
    notes: "Left thigh, IM. Due since 04 Jul.",
    consumables: ["Pentavalent vial × 1", "Syringe 0.5ml × 1"],
    state: "pending",
    orderedBy: "Dr. Sameera Rahman",
    orderedAt: "09:55",
  },
  {
    id: "t4",
    tokenNumber: 9,
    patientName: "Lakshmi Devi",
    patientAge: "62 y",
    procedure: "Dressing — left foot ulcer",
    consumables: ["Sterile gauze × 4", "Betadine 10ml"],
    state: "done",
    assignedTo: "Sr. Latha",
    orderedBy: "Dr. Anand Gowda",
    orderedAt: "09:10",
  },
];

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  tone: "neutral" | "warning" | "alert";
};

export const auditEntries: AuditEntry[] = [
  {
    id: "a1",
    at: "10:04",
    actor: "Dr. Sameera Rahman",
    action: "Allergy override",
    detail:
      "Prescribed Amoxicillin Susp. to Aarav Prakash — “Prior reaction mild, no alternative in stock”",
    tone: "alert",
  },
  {
    id: "a2",
    at: "09:58",
    actor: "Rekha S",
    action: "Dispensed",
    detail: "Ondansetron 4mg × 6 (batch ON-1120) — Schedule H1 register updated",
    tone: "warning",
  },
  {
    id: "a3",
    at: "09:47",
    actor: "Dr. Sameera Rahman",
    action: "Discount",
    detail: "₹50 off token 11 — “staff family”",
    tone: "warning",
  },
  {
    id: "a4",
    at: "09:31",
    actor: "Latha Bai",
    action: "Vitals recorded",
    detail: "Token 13 — Bhavana R",
    tone: "neutral",
  },
  {
    id: "a5",
    at: "09:12",
    actor: "Rekha S",
    action: "Patient merged",
    detail: "Duplicate “Lakshmi D” merged into “Lakshmi Devi”",
    tone: "neutral",
  },
];

export type WaMessage = {
  id: string;
  to: string;
  patientName: string;
  template: string;
  status: "delivered" | "sent" | "queued" | "failed";
  at: string;
  costPaise: number;
  failureReason?: string;
};

export const waMessages: WaMessage[] = [
  {
    id: "w1",
    to: "9845012233",
    patientName: "Aarav Prakash",
    template: "Prescription PDF",
    status: "delivered",
    at: "10:06",
    costPaise: 12,
  },
  {
    id: "w2",
    to: "9880778899",
    patientName: "Bhavana R",
    template: "Vaccination due reminder",
    status: "delivered",
    at: "09:00",
    costPaise: 12,
  },
  {
    id: "w3",
    to: "9902334455",
    patientName: "Lakshmi Devi",
    template: "Follow-up reminder",
    status: "failed",
    at: "08:45",
    costPaise: 0,
    failureReason: "Number not on WhatsApp",
  },
  {
    id: "w4",
    to: "9741556677",
    patientName: "Manjunath S",
    template: "Token confirmation",
    status: "sent",
    at: "09:52",
    costPaise: 12,
  },
];
