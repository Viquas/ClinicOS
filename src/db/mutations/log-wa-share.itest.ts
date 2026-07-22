import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { waMessages } from "@/db/schema";
import { logWaShare } from "./log-wa-share";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000003";
let rowId: string;

afterEach(async () => {
  if (rowId) await db.delete(waMessages).where(eq(waMessages.id, rowId));
});

describe("logWaShare", () => {
  it("records a shared message with its template and patient", async () => {
    const result = await logWaShare({
      clinicId: CLINIC,
      toPhone: "9845012233",
      templateName: "prescription_share",
      patientName: "Aarav Prakash",
      actorStaffId: STAFF,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    rowId = result.messageId;

    const [row] = await db
      .select({ status: waMessages.status, payload: waMessages.payload })
      .from(waMessages)
      .where(eq(waMessages.id, result.messageId));
    expect(row.status).toBe("shared");
    expect(row.payload).toMatchObject({ patientName: "Aarav Prakash" });
  });
});
