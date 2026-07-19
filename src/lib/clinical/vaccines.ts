/**
 * Vaccination schedule (§7.6 P1).
 *
 * §14 names pediatrics as the wedge specialty and this module as the thing
 * that sells it — a due-list the clinic can act on, and a WhatsApp reminder
 * the parent actually receives.
 *
 * SCOPE: the schedule below follows the IAP immunisation timetable for the
 * common antigens. It is a working subset, not the complete IAP chart —
 * catch-up schedules, and the rules for a child who starts late, are not
 * modelled. Adding a row is data, not code, which is the point.
 *
 * All dates are handled as UTC-midnight ISO strings. Local-midnight Date
 * arithmetic silently shifts by a day across IST's +05:30 offset, which would
 * show a vaccine as due one day early or late — visible and wrong on a chart
 * a parent is reading.
 */

export type VaccineDose = {
  id: string;
  name: string;
  /** Weeks after date of birth this dose becomes due. */
  dueAtWeeks: number;
  /** Doses given later than this are recorded but flagged as delayed. */
  graceWeeks: number;
};

/** IAP-aligned subset, birth through 18 months. */
export const SCHEDULE: VaccineDose[] = [
  { id: "bcg", name: "BCG", dueAtWeeks: 0, graceWeeks: 4 },
  { id: "hepb-0", name: "Hepatitis B — birth", dueAtWeeks: 0, graceWeeks: 2 },
  { id: "opv-0", name: "OPV — 0", dueAtWeeks: 0, graceWeeks: 2 },
  { id: "penta-1", name: "Pentavalent 1", dueAtWeeks: 6, graceWeeks: 4 },
  { id: "opv-1", name: "OPV 1", dueAtWeeks: 6, graceWeeks: 4 },
  { id: "rota-1", name: "Rotavirus 1", dueAtWeeks: 6, graceWeeks: 4 },
  { id: "pcv-1", name: "PCV 1", dueAtWeeks: 6, graceWeeks: 4 },
  { id: "penta-2", name: "Pentavalent 2", dueAtWeeks: 10, graceWeeks: 4 },
  { id: "opv-2", name: "OPV 2", dueAtWeeks: 10, graceWeeks: 4 },
  { id: "rota-2", name: "Rotavirus 2", dueAtWeeks: 10, graceWeeks: 4 },
  { id: "pcv-2", name: "PCV 2", dueAtWeeks: 10, graceWeeks: 4 },
  { id: "penta-3", name: "Pentavalent 3", dueAtWeeks: 14, graceWeeks: 4 },
  { id: "opv-3", name: "OPV 3", dueAtWeeks: 14, graceWeeks: 4 },
  { id: "rota-3", name: "Rotavirus 3", dueAtWeeks: 14, graceWeeks: 4 },
  { id: "pcv-3", name: "PCV 3", dueAtWeeks: 14, graceWeeks: 4 },
  { id: "mmr-1", name: "MMR 1", dueAtWeeks: 39, graceWeeks: 8 },
  { id: "typhoid", name: "Typhoid conjugate", dueAtWeeks: 39, graceWeeks: 8 },
  { id: "hepa-1", name: "Hepatitis A 1", dueAtWeeks: 52, graceWeeks: 8 },
  { id: "varicella", name: "Varicella 1", dueAtWeeks: 60, graceWeeks: 8 },
  { id: "mmr-2", name: "MMR 2", dueAtWeeks: 65, graceWeeks: 8 },
  { id: "penta-b1", name: "DPT booster 1", dueAtWeeks: 70, graceWeeks: 8 },
];

export type DoseStatus = "given" | "due" | "upcoming" | "overdue";

export type ScheduledDose = {
  dose: VaccineDose;
  dueDate: string;
  status: DoseStatus;
  givenOn?: string;
  /** Days until due; negative once past due. */
  daysUntilDue: number;
};

const MS_PER_DAY = 86_400_000;

function toUtcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addWeeks(iso: string, weeks: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return toIsoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (toUtcDate(toIso).getTime() - toUtcDate(fromIso).getTime()) / MS_PER_DAY,
  );
}

/**
 * Builds the child's full schedule with each dose's status as of `asOf`.
 *
 * `given` wins over every other status: a dose administered late is still
 * given, and must never keep showing as overdue on the due-list. That is the
 * bug that would have the clinic calling a parent about a vaccine their child
 * already received.
 */
export function buildSchedule({
  dateOfBirth,
  givenDoses = {},
  asOf,
}: {
  dateOfBirth: string;
  /** doseId → ISO date administered. */
  givenDoses?: Record<string, string>;
  asOf: string;
}): ScheduledDose[] {
  return SCHEDULE.map((dose) => {
    const dueDate = addWeeks(dateOfBirth, dose.dueAtWeeks);
    const daysUntilDue = daysBetween(asOf, dueDate);
    const givenOn = givenDoses[dose.id];

    let status: DoseStatus;
    if (givenOn) {
      status = "given";
    } else if (daysUntilDue > 14) {
      status = "upcoming";
    } else if (daysUntilDue >= 0) {
      /* Within a fortnight: due, and worth a reminder. */
      status = "due";
    } else if (-daysUntilDue <= dose.graceWeeks * 7) {
      status = "due";
    } else {
      status = "overdue";
    }

    return { dose, dueDate, status, givenOn, daysUntilDue };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Doses a clinic should chase today — due or overdue, never given. */
export function dueDoses(schedule: ScheduledDose[]): ScheduledDose[] {
  return schedule.filter(
    (entry) => entry.status === "due" || entry.status === "overdue",
  );
}

export function nextDose(schedule: ScheduledDose[]): ScheduledDose | undefined {
  return schedule.find((entry) => entry.status !== "given");
}
