import { describe, expect, it } from "vitest";
import {
  clinicDaysAgo,
  clinicMonthsAgo,
  clinicToday,
} from "@/lib/clinic-date";
import { getMrQueue, getRepDirectory } from "./mr";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";

const TODAY = clinicToday();
const DAY_START = new Date(`${TODAY}T00:00:00+05:30`);
const DAY_END = new Date(`${clinicDaysAgo(-1)}T00:00:00+05:30`);

describe("getMrQueue", () => {
  it("returns today's rep visits with the right derived state", async () => {
    const queue = await getMrQueue(CLINIC, DAY_START, DAY_END);
    const byName = new Map(queue.map((r) => [r.name, r]));

    expect(byName.get("Kiran Shetty")?.state).toBe("waiting");
    expect(byName.get("Priya Nair")?.state).toBe("booked");
    expect(byName.get("Anil Kumar")?.state).toBe("seen");
  });

  it("resolves the company name through the join", async () => {
    const queue = await getMrQueue(CLINIC, DAY_START, DAY_END);
    const kiran = queue.find((r) => r.name === "Kiran Shetty")!;
    expect(kiran.companyName).toBe("Cipla");
  });

  it("finds Kiran's prior visit date, excluding today", async () => {
    const queue = await getMrQueue(CLINIC, DAY_START, DAY_END);
    const kiran = queue.find((r) => r.name === "Kiran Shetty")!;
    /* Seeded two months back; asserted as "before today" rather than a
       literal, since the seed is now anchored to the real date. */
    expect(kiran.lastVisit).toBe(clinicMonthsAgo(2));
  });

  it("returns no prior visit for a rep with no history before today", async () => {
    const queue = await getMrQueue(CLINIC, DAY_START, DAY_END);
    const priya = queue.find((r) => r.name === "Priya Nair")!;
    expect(priya.lastVisit).toBeNull();
  });

  it("never exposes the doctor's private notes", async () => {
    const queue = await getMrQueue(CLINIC, DAY_START, DAY_END);
    const anyRow = queue[0] as unknown as Record<string, unknown>;
    expect(anyRow.doctorNotes).toBeUndefined();
  });

  it("is scoped to the clinic", async () => {
    expect(await getMrQueue(OTHER_CLINIC, DAY_START, DAY_END)).toEqual([]);
  });

  it("excludes visits outside the day window", async () => {
    const farFuture = new Date("2030-01-01T00:00:00+05:30");
    const farFutureEnd = new Date("2030-01-02T00:00:00+05:30");
    expect(await getMrQueue(CLINIC, farFuture, farFutureEnd)).toEqual([]);
  });
});

describe("getRepDirectory", () => {
  it("lists reps for the clinic", async () => {
    const dir = await getRepDirectory(CLINIC);
    expect(dir.map((r) => r.name)).toContain("Kiran Shetty");
  });

  it("is scoped to the clinic", async () => {
    expect(await getRepDirectory(OTHER_CLINIC)).toEqual([]);
  });
});
