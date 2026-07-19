/**
 * Allergy conflict detection (§8.3 rule 1, §7.4).
 *
 * Prescribing into a recorded allergy class requires an explicit override with
 * a reason. That makes this the gate between a doctor and a drug that has
 * already hurt this patient once, so it is deliberately built to over-warn:
 * a false positive costs one dismissed banner, a false negative costs an
 * anaphylaxis.
 *
 * SCOPE: this matches on drug-class membership from a hand-maintained map.
 * It is not a substitute for a real drug database, and it does not do
 * cross-sensitivity beyond the pairs listed below. Full interaction checking
 * is P2 in the PRD; this covers the recorded-allergy case only.
 */

/**
 * Molecule → classes it belongs to. A drug can sit in several classes, and a
 * recorded allergy to any of them is a conflict.
 */
const DRUG_CLASSES: Record<string, string[]> = {
  amoxicillin: ["penicillin", "beta-lactam"],
  ampicillin: ["penicillin", "beta-lactam"],
  "amoxicillin-clavulanate": ["penicillin", "beta-lactam"],
  cloxacillin: ["penicillin", "beta-lactam"],
  cefixime: ["cephalosporin", "beta-lactam"],
  cefpodoxime: ["cephalosporin", "beta-lactam"],
  ceftriaxone: ["cephalosporin", "beta-lactam"],
  cotrimoxazole: ["sulfa"],
  sulfamethoxazole: ["sulfa"],
  ibuprofen: ["nsaid"],
  diclofenac: ["nsaid"],
  aspirin: ["nsaid", "salicylate"],
  azithromycin: ["macrolide"],
  erythromycin: ["macrolide"],
};

/**
 * Free-text an allergy might be recorded as → the canonical class.
 * Front desk types what the parent says, not a controlled vocabulary, so this
 * has to absorb messy input.
 */
const ALLERGY_SYNONYMS: Record<string, string> = {
  penicillin: "penicillin",
  pencillin: "penicillin", // common misspelling, seen in real registers
  amoxicillin: "penicillin",
  amoxycillin: "penicillin",
  augmentin: "penicillin",
  cephalosporin: "cephalosporin",
  cefixime: "cephalosporin",
  sulfa: "sulfa",
  sulpha: "sulfa",
  "sulfa drugs": "sulfa",
  cotrimoxazole: "sulfa",
  nsaid: "nsaid",
  nsaids: "nsaid",
  ibuprofen: "nsaid",
  aspirin: "salicylate",
  diclofenac: "nsaid",
  macrolide: "macrolide",
  azithromycin: "macrolide",
};

/**
 * Beta-lactam cross-sensitivity. Penicillin-allergic patients have a small but
 * real cross-reaction rate with cephalosporins, so a cephalosporin warns on a
 * recorded penicillin allergy — flagged as `crossSensitivity` so the UI can
 * word it as a caution rather than a direct match.
 */
const CROSS_SENSITIVITY: Record<string, string[]> = {
  penicillin: ["cephalosporin"],
  cephalosporin: ["penicillin"],
};

export type AllergyConflict = {
  drugName: string;
  /** The patient's recorded allergy text that triggered this. */
  recordedAllergy: string;
  matchedClass: string;
  /** True when this is a cross-reaction caution, not a direct class match. */
  crossSensitivity: boolean;
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    /* Registers record "Amoxicillin — rash"; only the molecule matters here. */
    .split(/[—\-–(,]/)[0]
    .trim();
}

function classesForDrug(drugName: string): string[] {
  const key = normalise(drugName);
  if (DRUG_CLASSES[key]) return DRUG_CLASSES[key];

  /* Brand names and strengths: fall back to substring matching on molecules. */
  const match = Object.keys(DRUG_CLASSES).find((molecule) =>
    key.includes(molecule),
  );
  return match ? DRUG_CLASSES[match] : [];
}

function classForAllergy(allergyText: string): string | undefined {
  const key = normalise(allergyText);
  if (ALLERGY_SYNONYMS[key]) return ALLERGY_SYNONYMS[key];

  return Object.entries(ALLERGY_SYNONYMS).find(([term]) =>
    key.includes(term),
  )?.[1];
}

/**
 * Returns every conflict between a drug and the patient's recorded allergies.
 * Empty array means no known conflict — which is not the same as "safe", and
 * the UI should not present it as such.
 */
export function findAllergyConflicts(
  drugName: string,
  recordedAllergies: string[],
): AllergyConflict[] {
  const drugClasses = classesForDrug(drugName);
  if (drugClasses.length === 0) return [];

  const conflicts: AllergyConflict[] = [];

  for (const recorded of recordedAllergies) {
    const allergyClass = classForAllergy(recorded);
    if (!allergyClass) continue;

    if (drugClasses.includes(allergyClass)) {
      conflicts.push({
        drugName,
        recordedAllergy: recorded,
        matchedClass: allergyClass,
        crossSensitivity: false,
      });
      continue;
    }

    const crossClasses = CROSS_SENSITIVITY[allergyClass] ?? [];
    const crossed = drugClasses.find((c) => crossClasses.includes(c));
    if (crossed) {
      conflicts.push({
        drugName,
        recordedAllergy: recorded,
        matchedClass: crossed,
        crossSensitivity: true,
      });
    }
  }

  return conflicts;
}
