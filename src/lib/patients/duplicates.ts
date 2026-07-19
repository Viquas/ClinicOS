/**
 * Duplicate detection (§7.1).
 *
 * The hard part is that a shared phone number is NORMAL here — a parent's
 * phone holds every child's record, and §7.1 makes that a first-class case.
 * So "same phone" is evidence of a family, not of a duplicate, and a detector
 * that keys on phone alone would spend all day proposing that siblings be
 * merged into one person.
 *
 * What actually distinguishes a duplicate from a family member is that a
 * duplicate agrees on the things a person cannot differ from themselves on —
 * sex and age — while a sibling differs on at least one. Name similarity then
 * separates "Lakshmi D / Lakshmi Devi" from "Aarav / Diya".
 *
 * Merging is destructive and irreversible in the eyes of a clinic, so this
 * only ever SUGGESTS. Nothing here merges anything on its own.
 */

export type Candidate = {
  id: string;
  name: string;
  phone: string;
  sex: string;
  ageLabel: string;
  /* Richness signals — used only to decide which record survives a merge. */
  allergies?: string[];
  tags?: string[];
  hasDateOfBirth?: boolean;
  /* A captured guardian is real, hard-won intake data for a pediatric
     record — the same kind of loss as a dropped allergy if the sparser
     duplicate survives, just lower-stakes, hence weighted below DOB. */
  hasGuardianName?: boolean;
};

export type DuplicatePair = {
  a: Candidate;
  b: Candidate;
  /** 0–1. Only pairs above SUGGEST_THRESHOLD are surfaced. */
  score: number;
  reasons: string[];
};

export const SUGGEST_THRESHOLD = 0.6;

function normaliseName(name: string): string {
  return (
    name
      .toLowerCase()
      /*
       * Punctuation becomes a SEPARATOR, not nothing. Deleting it collapses
       * "lakshmi.devi" into the single token "lakshmidevi", which then fails
       * to match "Lakshmi Devi" — and dotted names are common front-desk
       * input, so that miss would be routine rather than exotic.
       */
      .replace(/[^a-z]+/g, " ")
      .trim()
  );
}

/**
 * Token-aware similarity. Indian names are frequently recorded as a given
 * name plus an initial ("Lakshmi D") or plus a full surname ("Lakshmi Devi"),
 * so an initial that prefixes the other record's token counts as a match.
 */
export function nameSimilarity(a: string, b: string): number {
  const at = normaliseName(a).split(" ").filter(Boolean);
  const bt = normaliseName(b).split(" ").filter(Boolean);
  if (at.length === 0 || bt.length === 0) return 0;

  const [shorter, longer] = at.length <= bt.length ? [at, bt] : [bt, at];

  let matched = 0;
  const used = new Set<number>();

  for (const token of shorter) {
    const index = longer.findIndex(
      (other, i) =>
        !used.has(i) &&
        (other === token ||
          /* "d" matches "devi", but only as a leading initial. */
          (token.length === 1 && other.startsWith(token)) ||
          (other.length === 1 && token.startsWith(other))),
    );
    if (index !== -1) {
      used.add(index);
      matched++;
    }
  }

  return matched / shorter.length;
}

/**
 * Ranks how much a record is worth keeping, for choosing a merge survivor.
 *
 * Allergies dominate every other signal, and by a wide margin. Merging the
 * rich record INTO the sparse one leaves a surviving chart with no allergy
 * on it for a patient who has one — the archived row still holds it, but
 * nobody reads archived rows mid-consultation. That is a clinical-safety
 * failure, not a tidiness one.
 *
 * The alphabetical ordering this replaced would have picked "Lakshmi D" over
 * "Lakshmi Devi" and dropped a sulfa allergy off the visible chart.
 */
export function completeness(candidate: Candidate): number {
  const allergies = candidate.allergies?.length ?? 0;
  const tags = candidate.tags?.length ?? 0;

  return (
    allergies * 1000 +
    tags * 10 +
    (candidate.hasDateOfBirth ? 5 : 0) +
    (candidate.hasGuardianName ? 3 : 0) +
    /* Last resort only: a fuller name usually means the more careful entry. */
    Math.min(candidate.name.length, 9) / 10
  );
}

/**
 * Orders a pair so `a` is the record that should survive.
 * Ties break on id for a stable, reproducible suggestion.
 */
export function orderBySurvivor(a: Candidate, b: Candidate): [Candidate, Candidate] {
  const diff = completeness(b) - completeness(a);
  if (diff !== 0) return diff > 0 ? [b, a] : [a, b];
  return a.id <= b.id ? [a, b] : [b, a];
}

/**
 * Scores one pair. Returns null when the pair cannot be a duplicate at all,
 * which is a different statement from "scored low".
 */
export function scorePair(
  first: Candidate,
  second: Candidate,
): DuplicatePair | null {
  if (first.id === second.id) return null;

  /* Decide survivor before anything else, so `a` is always the keeper. */
  const [a, b] = orderBySurvivor(first, second);

  /* Different phone numbers are treated as different people. Two records for
     one person across two phones exist, but merging on name alone would
     collide the many genuinely distinct patients who share a common name. */
  if (a.phone !== b.phone) return null;

  /* Same phone but different sex or age: a family member, not a duplicate.
     This is the check that keeps siblings apart. */
  if (a.sex !== b.sex) return null;
  if (a.ageLabel !== b.ageLabel) return null;

  const similarity = nameSimilarity(a.name, b.name);
  if (similarity === 0) return null;

  const reasons = ["Same phone number", "Same age and sex"];
  if (similarity === 1) reasons.push("Names match");
  else reasons.push("Names are similar");

  /* Name similarity carries most of the weight; the phone/age/sex agreement
     is what made the pair eligible at all. */
  const score = 0.5 + similarity * 0.5;

  return { a, b, score, reasons };
}

export function findDuplicates(patients: Candidate[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < patients.length; i++) {
    for (let j = i + 1; j < patients.length; j++) {
      const pair = scorePair(patients[i], patients[j]);
      if (pair && pair.score >= SUGGEST_THRESHOLD) pairs.push(pair);
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}
