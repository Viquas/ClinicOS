import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { waMessages } from "@/db/schema";

/**
 * WhatsApp message log (§7.10).
 *
 * Reads the real queue — every row here was written by a genuine product
 * action (currently: issuing a token). There is no send worker wired up in
 * this environment (no Meta Cloud API credential), so nothing here ever
 * progresses past "queued" on its own; the screen must not claim otherwise.
 */
export type MessageRow = {
  id: string;
  toPhone: string;
  templateName: string;
  status: string;
  payload: unknown;
  createdAt: Date;
  failureReason: string | null;
};

export async function getMessages(
  clinicId: string,
  limit = 50,
): Promise<MessageRow[]> {
  return db
    .select({
      id: waMessages.id,
      toPhone: waMessages.toPhone,
      templateName: waMessages.templateName,
      status: waMessages.status,
      payload: waMessages.payload,
      createdAt: waMessages.createdAt,
      failureReason: waMessages.failureReason,
    })
    .from(waMessages)
    .where(eq(waMessages.clinicId, clinicId))
    .orderBy(desc(waMessages.createdAt))
    .limit(limit);
}
