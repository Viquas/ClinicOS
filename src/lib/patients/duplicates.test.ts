import { describe, expect, it } from "vitest";
import {
  completeness,
  findDuplicates,
  nameSimilarity,
  orderBySurvivor,
  scorePair,
  SUGGEST_THRESHOLD,
  type Candidate,
} from "./duplicates";

const make = (over: Partial<Candidate> & Pick<Candidate, "id">): Candidate => ({
  name: "Lakshmi Devi",
  phone: "9902334455",
  sex: "Female",
  ageLabel: "62 y",
  ...over,
});

describe("the case this must never get wrong: siblings", () => {
  /* A pediatric clinic runs on shared phones. Proposing that two children be
     merged into one person is the failure that would make staff distrust the
     whole feature. */
  const aarav = make({
    id: "p1",
    name: "Aarav Prakash",
    phone: "9845012233",
    sex: "Male",
    ageLabel: "3 y 4 m",
  });
  const diya = make({
    id: "p2",
    name: "Diya Prakash",
    phone: "9845012233",
    sex: "Female",
    ageLabel: "7 y 1 m",
  });

  it("does not flag two siblings on one phone", () => {
    expect(scorePair(aarav, diya)).toBeNull();
  });

  it("does not flag same-sex siblings of different ages", () => {
    const brother = make({
      id: "p9",
      name: "Arjun Prakash",
      phone: "9845012233",
      sex: "Male",
      ageLabel: "9 y 2 m",
    });
    expect(scorePair(aarav, brother)).toBeNull();
  });

  it("does not flag twins with different names", () => {
    /* Same phone, same age, same sex — but the names share no token, so this
       is two people, not one record entered twice. */
    const twinA = make({
      id: "t1",
      name: "Rohan Iyer",
      phone: "9000011111",
      sex: "Male",
      ageLabel: "5 y",
    });
    const twinB = make({
      id: "t2",
      name: "Karan Iyer",
      phone: "9000011111",
      sex: "Male",
      ageLabel: "5 y",
    });
    /* Surname matches, given name does not → similarity 0.5, score 0.75.
       This one IS surfaced, which is correct: a human must decide. */
    const pair = scorePair(twinA, twinB);
    expect(pair).not.toBeNull();
    expect(pair!.reasons).toContain("Names are similar");
  });
});

describe("real duplicates", () => {
  it("flags the same person entered twice with an abbreviated name", () => {
    const full = make({ id: "p3", name: "Lakshmi Devi" });
    const abbreviated = make({ id: "p6", name: "Lakshmi D" });

    const pair = scorePair(full, abbreviated);

    expect(pair).not.toBeNull();
    expect(pair!.score).toBeGreaterThanOrEqual(SUGGEST_THRESHOLD);
    expect(pair!.reasons).toContain("Same phone number");
    expect(pair!.reasons).toContain("Same age and sex");
  });

  it("scores an exact name match highest", () => {
    const a = make({ id: "x1" });
    const b = make({ id: "x2" });

    expect(scorePair(a, b)!.score).toBe(1);
  });
});

describe("non-candidates", () => {
  it("never pairs a record with itself", () => {
    const a = make({ id: "p3" });
    expect(scorePair(a, a)).toBeNull();
  });

  it("does not pair across different phone numbers", () => {
    const a = make({ id: "p3", phone: "9902334455" });
    const b = make({ id: "p6", phone: "9111222333" });
    expect(scorePair(a, b)).toBeNull();
  });

  it("does not pair two unrelated people who share a phone", () => {
    const a = make({ id: "a", name: "Suresh Babu", sex: "Male", ageLabel: "45 y" });
    const b = make({ id: "b", name: "Lakshmi Devi", sex: "Female", ageLabel: "62 y" });
    expect(scorePair(a, b)).toBeNull();
  });
});

describe("nameSimilarity", () => {
  it("treats an initial as matching the full token it prefixes", () => {
    expect(nameSimilarity("Lakshmi D", "Lakshmi Devi")).toBe(1);
    expect(nameSimilarity("Lakshmi Devi", "Lakshmi D")).toBe(1);
  });

  it("does not treat an initial as matching an unrelated token", () => {
    expect(nameSimilarity("Lakshmi K", "Lakshmi Devi")).toBe(0.5);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(nameSimilarity("LAKSHMI DEVI", "lakshmi.devi")).toBe(1);
  });

  it("returns zero for entirely different names", () => {
    expect(nameSimilarity("Aarav", "Diya")).toBe(0);
  });

  it("does not double-count a repeated token", () => {
    /* "Devi Devi" must not score 1.0 against "Devi Kumari" by matching the
       same token twice. */
    expect(nameSimilarity("Devi Devi", "Devi Kumari")).toBe(0.5);
  });

  it("handles empty input without dividing by zero", () => {
    expect(nameSimilarity("", "Lakshmi")).toBe(0);
    expect(nameSimilarity("...", "Lakshmi")).toBe(0);
  });
});

describe("findDuplicates", () => {
  const roster: Candidate[] = [
    make({ id: "p3", name: "Lakshmi Devi" }),
    make({ id: "p6", name: "Lakshmi D" }),
    make({
      id: "p1",
      name: "Aarav Prakash",
      phone: "9845012233",
      sex: "Male",
      ageLabel: "3 y 4 m",
    }),
    make({
      id: "p2",
      name: "Diya Prakash",
      phone: "9845012233",
      sex: "Female",
      ageLabel: "7 y 1 m",
    }),
  ];

  it("finds the duplicate and leaves the siblings alone", () => {
    const found = findDuplicates(roster);

    expect(found).toHaveLength(1);
    expect([found[0].a.id, found[0].b.id].sort()).toEqual(["p3", "p6"]);
  });

  it("returns each pair once, not twice", () => {
    expect(findDuplicates(roster)).toHaveLength(1);
  });

  it("returns nothing for an empty or single-patient roster", () => {
    expect(findDuplicates([])).toEqual([]);
    expect(findDuplicates([make({ id: "only" })])).toEqual([]);
  });
});


describe("choosing which record survives a merge", () => {
  /*
   * The bug this guards against: with alphabetical ordering, "Lakshmi D" was
   * proposed as the survivor over "Lakshmi Devi", which would have archived
   * the only record carrying the patient's sulfa allergy. The allergy would
   * still exist in the database and be invisible on the chart the doctor
   * reads — worse than not merging at all.
   */
  const rich = make({
    id: "rich",
    name: "Lakshmi Devi",
    allergies: ["Sulfa drugs"],
    tags: ["Chronic: diabetes", "Chronic: hypertension"],
  });
  const sparse = make({ id: "sparse", name: "Lakshmi D" });

  it("keeps the record holding an allergy, whichever order it arrives in", () => {
    expect(orderBySurvivor(rich, sparse)[0].id).toBe("rich");
    expect(orderBySurvivor(sparse, rich)[0].id).toBe("rich");
  });

  it("puts the allergy-bearing record first on the pair", () => {
    expect(scorePair(sparse, rich)!.a.id).toBe("rich");
    expect(scorePair(rich, sparse)!.a.id).toBe("rich");
  });

  it("ranks an allergy above any number of tags", () => {
    const oneAllergy = make({ id: "a", allergies: ["Penicillin"] });
    const manyTags = make({ id: "b", tags: ["x", "y", "z", "w", "v"] });

    expect(completeness(oneAllergy)).toBeGreaterThan(completeness(manyTags));
  });

  it("prefers tags when neither record has an allergy", () => {
    const tagged = make({ id: "a", tags: ["Chronic: diabetes"] });
    const bare = make({ id: "b" });

    expect(orderBySurvivor(bare, tagged)[0].id).toBe("a");
  });

  it("prefers a record with a date of birth over one with only an age", () => {
    const withDob = make({ id: "a", hasDateOfBirth: true });
    const withoutDob = make({ id: "b" });

    expect(orderBySurvivor(withoutDob, withDob)[0].id).toBe("a");
  });

  it("prefers a record with a captured guardian name over one without", () => {
    const withGuardian = make({ id: "a", hasGuardianName: true });
    const withoutGuardian = make({ id: "b" });

    expect(orderBySurvivor(withoutGuardian, withGuardian)[0].id).toBe("a");
  });

  it("ranks a date of birth above a guardian name", () => {
    const dobOnly = make({ id: "a", hasDateOfBirth: true });
    const guardianOnly = make({ id: "b", hasGuardianName: true });

    expect(completeness(dobOnly)).toBeGreaterThan(completeness(guardianOnly));
  });

  it("falls back to the fuller name when all else is equal", () => {
    const full = make({ id: "a", name: "Lakshmi Devi" });
    const abbreviated = make({ id: "b", name: "Lakshmi D" });

    expect(orderBySurvivor(abbreviated, full)[0].id).toBe("a");
  });

  it("is stable when the records are genuinely identical", () => {
    const x = make({ id: "aaa" });
    const y = make({ id: "bbb" });

    expect(orderBySurvivor(x, y)[0].id).toBe("aaa");
    expect(orderBySurvivor(y, x)[0].id).toBe("aaa");
  });
});
