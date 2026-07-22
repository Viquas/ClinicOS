import "server-only";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { waMessages } from "@/db/schema";

export type LogWaShareResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Records a wa.me share in the message log (§7.10).
 *
 * "shared" is its own status, distinct from the provider pipeline
 * (queued → sent → delivered): it means a staff member opened WhatsApp on
 * this device with the message prefilled. We cannot know whether they
 * pressed send — the log entry is "it was handed to WhatsApp", which is
 * still worth a line in the day's communication record. Deliberately not
 * counted in the estimated-spend tile, which only counts sent/delivered.
 */
export async function logWaShare({
  clinicId,
  toPhone,
  templateName,
  patientName,
  actorStaffId,
  executor = db,
}: {
  clinicId: string;
  toPhone: string;
  templateName:
    | "prescription_share"
    | "bill_receipt_share"
    | "vaccination_reminder_share";
  patientName: string;
  actorStaffId: string | null;
  executor?: Executor;
}): Promise<LogWaShareResult> {
  try {
    const [row] = await executor
      .insert(waMessages)
      .values({
        clinicId,
        toPhone,
        templateName,
        status: "shared",
        payload: { patientName, sharedByStaffId: actorStaffId },
      })
      .returning({ id: waMessages.id });
    return { ok: true, messageId: row.id };
  } catch (error) {
    console.error("logWaShare failed", error);
    return { ok: false, error: "Could not log the share" };
  }
}
