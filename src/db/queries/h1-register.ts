import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scheduleH1Register } from "@/db/schema";

/**
 * Schedule H1 register (§9.3) — the statutory dispensing record.
 *
 * Read straight from the table the dispense mutation writes. The columns are
 * the legal record, so they are returned in full rather than summarised, and
 * newest-first because an inspector reads the most recent entries first.
 */
export type H1Entry = {
  id: string;
  dispensedOn: string;
  patientName: string;
  doctorName: string;
  doctorRegistrationNo: string | null;
  drugName: string;
  batchNo: string;
  quantity: number;
};

export async function getH1Register(
  clinicId: string,
  limit = 100,
): Promise<H1Entry[]> {
  const rows = await db
    .select({
      id: scheduleH1Register.id,
      dispensedOn: scheduleH1Register.dispensedOn,
      patientName: scheduleH1Register.patientName,
      doctorName: scheduleH1Register.doctorName,
      doctorRegistrationNo: scheduleH1Register.doctorRegistrationNo,
      drugName: scheduleH1Register.drugName,
      batchNo: scheduleH1Register.batchNo,
      quantity: scheduleH1Register.quantity,
    })
    .from(scheduleH1Register)
    .where(eq(scheduleH1Register.clinicId, clinicId))
    .orderBy(desc(scheduleH1Register.dispensedOn), desc(scheduleH1Register.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    quantity: Number(r.quantity),
  }));
}
