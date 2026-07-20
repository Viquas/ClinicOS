import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, medicalReps, mrCompanies, mrVisits } from "@/db/schema";
import { getRepDirectory } from "@/db/queries/mr";
import { addRep, archiveRep } from "./manage-reps";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const REKHA = "22222222-0000-0000-0000-000000000004";

const base = {
  clinicId: CLINIC,
  actorStaffId: REKHA,
  name: "Sunil Rao",
  companyName: "Zydus",
  phone: "99000 11223",
  division: "Cardiology",
};

afterEach(async () => {
  /* Remove only what these tests created — the seeded reps stay. */
  const created = await db
    .select({ id: medicalReps.id })
    .from(medicalReps)
    .where(eq(medicalReps.name, "Sunil Rao"));
  for (const r of created) {
    await db.delete(auditLog).where(eq(auditLog.entityId, r.id));
    await db.delete(medicalReps).where(eq(medicalReps.id, r.id));
  }
  await db.delete(mrCompanies).where(eq(mrCompanies.name, "Zydus"));
});

describe("addRep", () => {
  it("adds a rep and a new company together", async () => {
    const result = await addRep(base);
    expect(result.ok).toBe(true);

    const directory = await getRepDirectory(CLINIC);
    const sunil = directory.find((r) => r.name === "Sunil Rao");
    expect(sunil?.companyName).toBe("Zydus");
  });

  it("reuses an existing company rather than duplicating it", async () => {
    await addRep(base);
    await addRep({ ...base, name: "Sunil Rao", companyName: "Zydus" });

    const companies = await db
      .select()
      .from(mrCompanies)
      .where(eq(mrCompanies.name, "Zydus"));
    expect(companies).toHaveLength(1);
  });

  it("matches an existing company case-insensitively", async () => {
    /* A front desk typing "cipla" must not create a second Cipla. */
    const before = await db
      .select()
      .from(mrCompanies)
      .where(eq(mrCompanies.clinicId, CLINIC));

    const result = await addRep({ ...base, companyName: "cipla" });
    expect(result.ok).toBe(true);

    const after = await db
      .select()
      .from(mrCompanies)
      .where(eq(mrCompanies.clinicId, CLINIC));
    expect(after).toHaveLength(before.length);

    /* And the rep is attached to the ORIGINAL, correctly-cased company. */
    const directory = await getRepDirectory(CLINIC);
    expect(directory.find((r) => r.name === "Sunil Rao")?.companyName).toBe(
      "Cipla",
    );
  });

  it("normalises the phone number", async () => {
    const result = await addRep(base);
    if (!result.ok) return;

    const [rep] = await db
      .select({ phone: medicalReps.phone })
      .from(medicalReps)
      .where(eq(medicalReps.id, result.repId));
    expect(rep.phone).toBe("9900011223");
  });

  it("accepts a rep with no phone or division", async () => {
    const result = await addRep({
      clinicId: CLINIC,
      actorStaffId: REKHA,
      name: "Sunil Rao",
      companyName: "Zydus",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a malformed phone", async () => {
    expect((await addRep({ ...base, phone: "12345" })).ok).toBe(false);
  });

  it("refuses an empty name or company", async () => {
    expect((await addRep({ ...base, name: " " })).ok).toBe(false);
    expect((await addRep({ ...base, companyName: " " })).ok).toBe(false);
  });

  it("writes nothing when validation fails", async () => {
    const before = await db
      .select()
      .from(mrCompanies)
      .where(eq(mrCompanies.clinicId, CLINIC));

    await addRep({ ...base, name: " " });

    const after = await db
      .select()
      .from(mrCompanies)
      .where(eq(mrCompanies.clinicId, CLINIC));
    expect(after).toHaveLength(before.length);
  });

  it("keeps the new rep out of another clinic's directory", async () => {
    await addRep(base);
    const other = await getRepDirectory(OTHER_CLINIC);
    expect(other.map((r) => r.name)).not.toContain("Sunil Rao");
  });

  it("logs the addition", async () => {
    const result = await addRep(base);
    if (!result.ok) return;

    const [entry] = await db
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.entityId, result.repId));
    expect(entry.action).toBe("mr_rep_added");
    expect(entry.detail).toMatchObject({ company: "Zydus" });
  });
});

describe("archiveRep", () => {
  it("removes a rep from the directory without deleting them", async () => {
    const added = await addRep(base);
    if (!added.ok) return;

    const result = await archiveRep({
      clinicId: CLINIC,
      repId: added.repId,
      actorStaffId: REKHA,
    });
    expect(result.ok).toBe(true);

    expect((await getRepDirectory(CLINIC)).map((r) => r.name)).not.toContain(
      "Sunil Rao",
    );

    /* The row survives, so past visits still join. */
    const [row] = await db
      .select({ archivedAt: medicalReps.archivedAt })
      .from(medicalReps)
      .where(eq(medicalReps.id, added.repId));
    expect(row.archivedAt).not.toBeNull();
  });

  it("refuses while a visit is still open", async () => {
    const added = await addRep(base);
    if (!added.ok) return;

    await db.insert(mrVisits).values({
      clinicId: CLINIC,
      repId: added.repId,
      doctorId: "33333333-0000-0000-0000-000000000001",
      checkedInAt: new Date(),
    });

    const result = await archiveRep({
      clinicId: CLINIC,
      repId: added.repId,
      actorStaffId: REKHA,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("still open");

    await db.delete(mrVisits).where(eq(mrVisits.repId, added.repId));
  });

  it("allows archiving once the visit is seen", async () => {
    const added = await addRep(base);
    if (!added.ok) return;

    await db.insert(mrVisits).values({
      clinicId: CLINIC,
      repId: added.repId,
      doctorId: "33333333-0000-0000-0000-000000000001",
      checkedInAt: new Date(),
      seenAt: new Date(),
    });

    expect(
      (await archiveRep({ clinicId: CLINIC, repId: added.repId, actorStaffId: REKHA }))
        .ok,
    ).toBe(true);

    await db.delete(mrVisits).where(eq(mrVisits.repId, added.repId));
  });

  it("refuses an unknown rep", async () => {
    const result = await archiveRep({
      clinicId: CLINIC,
      repId: "00000000-0000-0000-0000-000000000000",
      actorStaffId: REKHA,
    });
    expect(result.ok).toBe(false);
  });

  it("is scoped to the clinic", async () => {
    const added = await addRep(base);
    if (!added.ok) return;

    const result = await archiveRep({
      clinicId: OTHER_CLINIC,
      repId: added.repId,
      actorStaffId: REKHA,
    });
    expect(result.ok).toBe(false);

    const [row] = await db
      .select({ archivedAt: medicalReps.archivedAt })
      .from(medicalReps)
      .where(
        and(eq(medicalReps.id, added.repId), isNull(medicalReps.archivedAt)),
      );
    expect(row).toBeDefined();
  });
});
