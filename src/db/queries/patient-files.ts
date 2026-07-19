import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { patientFiles } from "@/db/schema";

/**
 * Attachments on a patient record (§7.1) — lab reports, external
 * prescriptions, photos from the tablet camera.
 *
 * Returns the metadata only; the file bytes live in storage and are fetched on
 * demand when a row is opened. Newest-first, because the most recent report is
 * the one a doctor reaches for.
 */
export type PatientFileRow = {
  id: string;
  kind: string;
  label: string | null;
  storagePath: string;
  createdAt: Date;
};

export async function getPatientFiles(
  clinicId: string,
  patientId: string,
  tx: Executor = db,
): Promise<PatientFileRow[]> {
  return tx
    .select({
      id: patientFiles.id,
      kind: patientFiles.kind,
      label: patientFiles.label,
      storagePath: patientFiles.storagePath,
      createdAt: patientFiles.createdAt,
    })
    .from(patientFiles)
    .where(
      and(
        eq(patientFiles.clinicId, clinicId),
        eq(patientFiles.patientId, patientId),
        isNull(patientFiles.archivedAt),
      ),
    )
    .orderBy(desc(patientFiles.createdAt));
}
