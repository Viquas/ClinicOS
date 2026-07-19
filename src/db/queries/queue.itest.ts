import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import {
  getBookableDoctors,
  getDoctors,
  getNextTokenNumber,
  getQueue,
} from "./queue";

/**
 * Integration tests — these hit a real Postgres.
 *
 * Named .itest.ts so the unit suite stays fast and offline; run with
 * `pnpm test:db` after `pnpm db:start && pnpm db:seed`.
 *
 * The point is to catch what unit tests structurally cannot: a join that
 * drops rows, a sort that comes back in the wrong order, a column that is
 * null in practice. Every bug this file has caught was invisible to tsc.
 */

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const TODAY = "2026-07-18";

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set — run `pnpm db:start` and seed before test:db",
    );
  }
});

describe("getQueue", () => {
  it("returns today's tokens for the clinic", async () => {
    /*
     * A property, not a count. The seeded row count is shared mutable state —
     * issuing a token through the UI changes it, and an exact-count assertion
     * then fails for a reason that has nothing to do with the query. This
     * file asserted `toBe(6)` and broke exactly that way.
     */
    const queue = await getQueue(CLINIC, TODAY);

    expect(queue.length).toBeGreaterThan(0);
    expect(queue.map((e) => e.patientName)).toContain("Aarav Prakash");
    expect(queue.every((e) => e.number > 0)).toBe(true);
  });

  it("returns nothing for a clinic with no data", async () => {
    expect(await getQueue(OTHER_CLINIC, TODAY)).toEqual([]);
  });

  it("returns nothing for a date with no clinic", async () => {
    expect(await getQueue(CLINIC, "2020-01-01")).toEqual([]);
  });

  it("puts priority tokens first, then ascending token number", async () => {
    const queue = await getQueue(CLINIC, TODAY);
    const priorityIndex = queue.findIndex((e) => e.isPriority);

    expect(priorityIndex).toBe(0);

    /* Within the non-priority tail, numbers ascend. */
    const rest = queue.slice(1).map((e) => e.number);
    expect([...rest].sort((a, b) => a - b)).toEqual(rest);
  });

  it("keeps a token with no vitals recorded", async () => {
    /* The left join is what makes this work — an inner join would silently
       drop every patient who has not seen the nurse yet, which is most of
       the queue first thing in the morning. */
    const queue = await getQueue(CLINIC, TODAY);
    const withoutVitals = queue.filter((e) => e.vitals === null);

    expect(withoutVitals.length).toBeGreaterThan(0);
  });

  it("attaches recorded vitals to the right patient", async () => {
    const queue = await getQueue(CLINIC, TODAY);
    const aarav = queue.find((e) => e.patientName === "Aarav Prakash")!;

    expect(aarav.vitals).toMatchObject({ tempC: 38.9, weightKg: 14.2 });
  });

  it("carries allergies through for the pinned banner", async () => {
    const queue = await getQueue(CLINIC, TODAY);
    const aarav = queue.find((e) => e.patientName === "Aarav Prakash")!;

    expect(aarav.allergies).toContain("Amoxicillin — rash");
  });

  it("returns an empty array, not null, for a patient with no allergies", async () => {
    const queue = await getQueue(CLINIC, TODAY);
    const manjunath = queue.find((e) => e.patientName === "Manjunath S")!;

    expect(manjunath.allergies).toEqual([]);
    expect(manjunath.tags).toEqual([]);
  });

  it("resolves the doctor's name through the staff join", async () => {
    const queue = await getQueue(CLINIC, TODAY);
    expect(queue.every((e) => e.doctorName.length > 0)).toBe(true);
  });
});

describe("getDoctors", () => {
  it("returns both doctors with their staff names", async () => {
    const list = await getDoctors(CLINIC);

    expect(list).toHaveLength(2);
    expect(list.map((d) => d.name).sort()).toEqual([
      "Dr. Anand Gowda",
      "Dr. Sameera Rahman",
    ]);
  });

  it("exposes the missing registration number that blocks prescribing", async () => {
    const list = await getDoctors(CLINIC);
    const anand = list.find((d) => d.name === "Dr. Anand Gowda")!;

    expect(anand.registrationNo).toBeNull();
  });

  it("is scoped to the clinic", async () => {
    expect(await getDoctors(OTHER_CLINIC)).toEqual([]);
  });
});

describe("getBookableDoctors", () => {
  const ANAND_STAFF = "22222222-0000-0000-0000-000000000002";

  it("matches the full list when everyone is active with the doctor role", async () => {
    const bookable = await getBookableDoctors(CLINIC);
    const full = await getDoctors(CLINIC);
    expect(bookable.map((d) => d.name).sort()).toEqual(
      full.map((d) => d.name).sort(),
    );
  });

  it("drops a deactivated doctor from bookable but keeps them in the full list", async () => {
    await db.update(staff).set({ isActive: false }).where(eq(staff.id, ANAND_STAFF));
    try {
      const bookable = await getBookableDoctors(CLINIC);
      expect(bookable.map((d) => d.name)).not.toContain("Dr. Anand Gowda");

      /* The queue/display path must keep him — his tokens still exist. */
      const full = await getDoctors(CLINIC);
      expect(full.map((d) => d.name)).toContain("Dr. Anand Gowda");
    } finally {
      await db.update(staff).set({ isActive: true }).where(eq(staff.id, ANAND_STAFF));
    }
  });

  it("drops a doctor whose doctor role was revoked", async () => {
    await db.update(staff).set({ roles: ["front_desk"] }).where(eq(staff.id, ANAND_STAFF));
    try {
      const bookable = await getBookableDoctors(CLINIC);
      expect(bookable.map((d) => d.name)).not.toContain("Dr. Anand Gowda");
    } finally {
      await db.update(staff).set({ roles: ["doctor"] }).where(eq(staff.id, ANAND_STAFF));
    }
  });
});

describe("getNextTokenNumber", () => {
  const SAMEERA = "33333333-0000-0000-0000-000000000001";
  const ANAND = "33333333-0000-0000-0000-000000000002";

  it("continues each doctor's own sequence independently", async () => {
    /*
     * Derived from the live queue rather than hardcoded, so this keeps
     * holding as tokens are issued. The property under test is that the two
     * doctors do not share a counter — not what today's numbers happen to be.
     */
    const queue = await getQueue(CLINIC, TODAY);

    const highest = (doctorId: string) =>
      Math.max(
        0,
        ...queue.filter((e) => e.doctorId === doctorId).map((e) => e.number),
      );

    expect(await getNextTokenNumber(CLINIC, SAMEERA, TODAY)).toBe(
      highest(SAMEERA) + 1,
    );
    expect(await getNextTokenNumber(CLINIC, ANAND, TODAY)).toBe(
      highest(ANAND) + 1,
    );

    /* And they are genuinely different sequences. */
    expect(highest(SAMEERA)).not.toBe(highest(ANAND));
  });

  it("starts at 1 on a fresh day", async () => {
    expect(await getNextTokenNumber(CLINIC, SAMEERA, "2027-01-01")).toBe(1);
  });

  it("starts at 1 for a clinic with no tokens", async () => {
    expect(await getNextTokenNumber(OTHER_CLINIC, SAMEERA, TODAY)).toBe(1);
  });
});
