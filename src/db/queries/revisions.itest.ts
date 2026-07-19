import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordRevisions } from "@/db/schema";
import { getRecordRevisions } from "./revisions";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-0000-0000-0000-000000000001";
const ENTITY_ID = "44444444-0000-0000-0000-000000000007";

async function cleanup() {
  await db
    .delete(recordRevisions)
    .where(eq(recordRevisions.entityId, ENTITY_ID));
}

beforeEach(cleanup);
afterEach(cleanup);

describe("getRecordRevisions", () => {
  it("returns revisions newest-first with the editor's name resolved", async () => {
    await db.insert(recordRevisions).values([
      {
        clinicId: CLINIC,
        entityTable: "patients",
        entityId: ENTITY_ID,
        previousValues: { phone: "9448100000" },
        reason: "First correction",
        editedByStaffId: STAFF,
      },
    ]);
    await db.insert(recordRevisions).values([
      {
        clinicId: CLINIC,
        entityTable: "patients",
        entityId: ENTITY_ID,
        previousValues: { phone: "9448111111" },
        reason: "Second correction",
        editedByStaffId: STAFF,
      },
    ]);

    const revisions = await getRecordRevisions(CLINIC, "patients", ENTITY_ID);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].reason).toBe("Second correction");
    expect(revisions[0].editedByName).toBe("Dr. Sameera Rahman");
  });

  it("is scoped to the clinic", async () => {
    await db.insert(recordRevisions).values({
      clinicId: CLINIC,
      entityTable: "patients",
      entityId: ENTITY_ID,
      previousValues: {},
      reason: "Test",
      editedByStaffId: STAFF,
    });

    expect(
      await getRecordRevisions(
        "99999999-9999-9999-9999-999999999999",
        "patients",
        ENTITY_ID,
      ),
    ).toEqual([]);
  });

  it("returns an empty list for an entity with no revisions", async () => {
    expect(await getRecordRevisions(CLINIC, "patients", ENTITY_ID)).toEqual([]);
  });
});
