import { afterEach, describe, expect, it } from "vitest";
import { clinicToday } from "@/lib/clinic-date";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, procedureTasks, visits } from "@/db/schema";
import { recordVaccineDose } from "./record-vaccine-dose";
import { getVaccinationRoster } from "@/db/queries/vaccinations";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000003";
const DOCTOR = "33333333-0000-0000-0000-000000000001";
const AARAV = "44444444-0000-0000-0000-000000000001";
const DR_ANAND = "33333333-0000-0000-0000-000000000002";

const createdVisitIds: string[] = [];

afterEach(async () => {
  for (const visitId of createdVisitIds) {
    await db.delete(auditLog).where(eq(auditLog.entityTable, "procedure_tasks"));
    await db.delete(procedureTasks).where(eq(procedureTasks.visitId, visitId));
    await db.delete(visits).where(eq(visits.id, visitId));
  }
  createdVisitIds.length = 0;
});

describe("recordVaccineDose", () => {
  it("creates a visit and a completed procedure task", async () => {
    const result = await recordVaccineDose({
      clinicId: CLINIC,
      patientId: AARAV,
      doseId: "mmr-1",
      doctorId: DOCTOR,
      actorStaffId: STAFF,
      givenOn: clinicToday(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [task] = await db
      .select({ state: procedureTasks.state, visitId: procedureTasks.visitId })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, result.taskId));

    expect(task.state).toBe("done");
    createdVisitIds.push(task.visitId);
  });

  it("makes the dose show as given on the roster afterwards", async () => {
    const result = await recordVaccineDose({
      clinicId: CLINIC,
      patientId: AARAV,
      doseId: "typhoid",
      doctorId: DOCTOR,
      actorStaffId: STAFF,
      givenOn: clinicToday(),
    });
    if (!result.ok) throw new Error("expected success");

    const [task] = await db
      .select({ visitId: procedureTasks.visitId })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, result.taskId));
    createdVisitIds.push(task.visitId);

    const roster = await getVaccinationRoster(CLINIC, clinicToday());
    const aarav = roster.find((r) => r.name === "Aarav Prakash")!;
    const typhoid = aarav.schedule.find((s) => s.dose.id === "typhoid")!;

    expect(typhoid.status).toBe("given");
    expect(typhoid.givenOn).toBe(clinicToday());
  });

  it("logs the dose with the antigen name", async () => {
    const result = await recordVaccineDose({
      clinicId: CLINIC,
      patientId: AARAV,
      doseId: "hepa-1",
      doctorId: DOCTOR,
      actorStaffId: STAFF,
      givenOn: clinicToday(),
    });
    if (!result.ok) throw new Error("expected success");

    const [task] = await db
      .select({ visitId: procedureTasks.visitId })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, result.taskId));
    createdVisitIds.push(task.visitId);

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, result.taskId));

    expect(entry.action).toBe("vaccine_dose_recorded");
    expect(entry.detail).toMatchObject({ dose: "Hepatitis A 1", patientId: AARAV });
  });

  it("refuses an unknown dose id", async () => {
    const result = await recordVaccineDose({
      clinicId: CLINIC,
      patientId: AARAV,
      doseId: "not-a-real-dose",
      doctorId: DOCTOR,
      actorStaffId: STAFF,
    });

    expect(result).toEqual({ ok: false, error: "Unknown vaccine dose" });
  });

  it("refuses a dose whose procedure does not exist under this clinic", async () => {
    const result = await recordVaccineDose({
      clinicId: "99999999-9999-9999-9999-999999999999",
      patientId: AARAV,
      doseId: "bcg",
      doctorId: DOCTOR,
      actorStaffId: STAFF,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not set up/i);
  });
});

describe("the supervising doctor", () => {
  it("records the dose against the doctor it was given, not a hardcoded one", async () => {
    /* This used to always name Dr Sameera, which is merely wrong rather than
       obviously wrong in a clinic with two doctors. */
    const result = await recordVaccineDose({
      clinicId: CLINIC,
      patientId: AARAV,
      doseId: "typhoid",
      doctorId: DR_ANAND,
      actorStaffId: STAFF,
      givenOn: clinicToday(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /* The dose creates its own visit; find it via the task it produced. */
    const [task] = await db
      .select({ visitId: procedureTasks.visitId })
      .from(procedureTasks)
      .where(eq(procedureTasks.id, result.taskId));
    createdVisitIds.push(task.visitId);

    const [visit] = await db
      .select({ doctorId: visits.doctorId })
      .from(visits)
      .where(eq(visits.id, task.visitId));
    expect(visit.doctorId).toBe(DR_ANAND);
  });
});
