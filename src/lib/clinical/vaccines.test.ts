import { describe, expect, it } from "vitest";
import {
  addWeeks,
  buildSchedule,
  daysBetween,
  dueDoses,
  nextDose,
  SCHEDULE,
} from "./vaccines";

const DOB = "2026-01-10";

describe("date arithmetic across the IST offset", () => {
  /* The whole reason these are UTC-midnight strings: local-midnight Date maths
     shifts by a day at +05:30 and shows a vaccine due one day early or late. */
  it("adds weeks without drifting", () => {
    expect(addWeeks("2026-01-10", 6)).toBe("2026-02-21");
    expect(addWeeks("2026-01-10", 0)).toBe("2026-01-10");
  });

  it("crosses a month boundary correctly", () => {
    expect(addWeeks("2026-01-28", 1)).toBe("2026-02-04");
  });

  it("crosses a year boundary correctly", () => {
    expect(addWeeks("2026-12-28", 2)).toBe("2027-01-11");
  });

  it("handles a leap day", () => {
    expect(addWeeks("2028-02-22", 1)).toBe("2028-02-29");
  });

  it("counts days in both directions", () => {
    expect(daysBetween("2026-01-10", "2026-01-17")).toBe(7);
    expect(daysBetween("2026-01-17", "2026-01-10")).toBe(-7);
    expect(daysBetween("2026-01-10", "2026-01-10")).toBe(0);
  });
});

describe("buildSchedule", () => {
  it("returns the whole schedule sorted by due date", () => {
    const schedule = buildSchedule({ dateOfBirth: DOB, asOf: "2026-01-10" });

    expect(schedule).toHaveLength(SCHEDULE.length);
    const dates = schedule.map((s) => s.dueDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it("dates the 6-week doses six weeks after birth", () => {
    const schedule = buildSchedule({ dateOfBirth: DOB, asOf: DOB });
    const penta1 = schedule.find((s) => s.dose.id === "penta-1")!;

    expect(penta1.dueDate).toBe("2026-02-21");
  });
});

describe("status transitions", () => {
  const at = (asOf: string) =>
    buildSchedule({ dateOfBirth: DOB, asOf }).find(
      (s) => s.dose.id === "penta-1",
    )!;

  it("is upcoming well before the due date", () => {
    expect(at("2026-01-10").status).toBe("upcoming");
  });

  it("becomes due within the fortnight before", () => {
    expect(at("2026-02-10").status).toBe("due");
  });

  it("is due on the day itself", () => {
    const dose = at("2026-02-21");
    expect(dose.status).toBe("due");
    expect(dose.daysUntilDue).toBe(0);
  });

  it("stays due inside the grace window", () => {
    /* 4-week grace → still due on 20 Mar. */
    expect(at("2026-03-20").status).toBe("due");
  });

  it("becomes overdue past the grace window", () => {
    expect(at("2026-04-01").status).toBe("overdue");
  });
});

describe("a given dose never reappears as owed", () => {
  /* The bug that would have the clinic phoning a parent about a vaccine their
     child already had — the fastest way to lose trust in the due-list. */
  it("reports given even when administered late", () => {
    const schedule = buildSchedule({
      dateOfBirth: DOB,
      givenDoses: { "penta-1": "2026-05-02" },
      asOf: "2026-06-01",
    });

    const penta1 = schedule.find((s) => s.dose.id === "penta-1")!;
    expect(penta1.status).toBe("given");
    expect(penta1.givenOn).toBe("2026-05-02");
  });

  it("excludes given doses from the due-list", () => {
    const schedule = buildSchedule({
      dateOfBirth: DOB,
      givenDoses: { "penta-1": "2026-05-02", "opv-1": "2026-05-02" },
      asOf: "2026-06-01",
    });

    const owed = dueDoses(schedule).map((d) => d.dose.id);
    expect(owed).not.toContain("penta-1");
    expect(owed).not.toContain("opv-1");
  });
});

describe("dueDoses", () => {
  it("returns nothing for a newborn on the day of birth beyond the birth doses", () => {
    const schedule = buildSchedule({ dateOfBirth: DOB, asOf: DOB });
    const owed = dueDoses(schedule);

    /* BCG, HepB-0 and OPV-0 are due at birth; nothing else yet. */
    expect(owed.map((d) => d.dose.id).sort()).toEqual([
      "bcg",
      "hepb-0",
      "opv-0",
    ]);
  });

  it("returns nothing when every dose is given", () => {
    const givenDoses = Object.fromEntries(
      SCHEDULE.map((d) => [d.id, "2027-01-01"]),
    );
    const schedule = buildSchedule({
      dateOfBirth: DOB,
      givenDoses,
      asOf: "2028-01-01",
    });

    expect(dueDoses(schedule)).toEqual([]);
  });
});

describe("nextDose", () => {
  it("skips completed doses", () => {
    const schedule = buildSchedule({
      dateOfBirth: DOB,
      givenDoses: { bcg: DOB, "hepb-0": DOB, "opv-0": DOB },
      asOf: DOB,
    });

    expect(nextDose(schedule)!.dose.id).toBe("penta-1");
  });

  it("is undefined once the schedule is complete", () => {
    const givenDoses = Object.fromEntries(
      SCHEDULE.map((d) => [d.id, "2027-01-01"]),
    );
    expect(
      nextDose(buildSchedule({ dateOfBirth: DOB, givenDoses, asOf: "2028-01-01" })),
    ).toBeUndefined();
  });
});
