/**
 * Specialty template packs (§6, §7.3, §7.12).
 *
 * §6's design rule is explicit: specialty differences live as data, never as
 * a code fork. This is that data, plus the one resolver every specialty-aware
 * screen (vitals capture, consult favourites, patient trends, module nav)
 * reads through. Adding a seventh specialty means adding an entry here, not
 * an `if (specialty === …)` anywhere else in the app.
 *
 * A doctor's own `templatePack` column (schema/clinic.ts) can override the
 * registry defaults — vitals field selection, diagnosis favourites — without
 * touching this file, which is what lets one clinic's dermatologist diverge
 * from the registry's dermatology defaults without a migration.
 */

export type VitalFieldMeta = {
  label: string;
  unit: string;
  inputMode?: "decimal" | "numeric";
};

/**
 * Canonical metadata for every measurable field across every specialty. A
 * specialty pack selects field KEYS from this catalog rather than repeating
 * label/unit text, so "Temperature / °C" is defined once no matter how many
 * specialties record it.
 */
export const VITAL_FIELD_CATALOG: Record<string, VitalFieldMeta> = {
  weightKg: { label: "Weight", unit: "kg" },
  heightCm: { label: "Height", unit: "cm" },
  tempC: { label: "Temperature", unit: "°C" },
  spo2: { label: "SpO₂", unit: "%", inputMode: "numeric" },
  bp: { label: "Blood pressure", unit: "mmHg" },
  pulse: { label: "Pulse", unit: "bpm", inputMode: "numeric" },
  headCircumferenceCm: { label: "Head circumference", unit: "cm" },
  fundalHeightCm: { label: "Fundal height", unit: "cm" },
  rbs: { label: "Random blood sugar", unit: "mg/dL", inputMode: "numeric" },
  fbs: { label: "Fasting blood sugar", unit: "mg/dL", inputMode: "numeric" },
};

export type SpecialtyModules = {
  /* Growth-chart trends on the patient record (weight-for-age percentile). */
  growthTrends: boolean;
  /* The IAP vaccination schedule + due-list chasing. */
  vaccinations: boolean;
};

export type SpecialtyPack = {
  vitalKeys: string[];
  diagnosisFavourites: string[];
  modules: SpecialtyModules;
};

const NO_MODULES: SpecialtyModules = { growthTrends: false, vaccinations: false };

/**
 * Specialty strings match `doctors.specialty` exactly (see seed.ts) — this is
 * the only place that string is interpreted as anything more than a label.
 */
export const SPECIALTY_REGISTRY: Record<string, SpecialtyPack> = {
  pediatrics: {
    vitalKeys: ["weightKg", "heightCm", "tempC", "spo2"],
    diagnosisFavourites: [
      "Acute viral fever",
      "URTI",
      "Acute gastroenteritis",
      "Wheeze-associated LRTI",
      "Otitis media",
    ],
    modules: { growthTrends: true, vaccinations: true },
  },

  general_medicine: {
    vitalKeys: ["bp", "pulse", "tempC", "spo2", "weightKg"],
    diagnosisFavourites: [
      "Viral fever",
      "Hypertension — review",
      "URTI",
      "Acute gastroenteritis",
      "Low back pain",
    ],
    modules: NO_MODULES,
  },

  gynecology: {
    vitalKeys: ["bp", "pulse", "weightKg", "fundalHeightCm"],
    diagnosisFavourites: [
      "Antenatal check-up",
      "PCOS — review",
      "Menstrual irregularity",
      "Urinary tract infection",
      "Anaemia in pregnancy",
    ],
    modules: NO_MODULES,
  },

  dermatology: {
    vitalKeys: ["tempC", "bp"],
    diagnosisFavourites: [
      "Atopic dermatitis",
      "Acne vulgaris",
      "Fungal skin infection",
      "Urticaria",
      "Contact dermatitis",
    ],
    modules: NO_MODULES,
  },

  diabetology: {
    vitalKeys: ["weightKg", "bp", "rbs", "pulse"],
    diagnosisFavourites: [
      "Type 2 diabetes — review",
      "Diabetic foot check",
      "Hypertension with diabetes",
      "Dyslipidaemia",
      "Diabetic retinopathy screening",
    ],
    modules: NO_MODULES,
  },

  orthopedics: {
    vitalKeys: ["bp", "pulse", "weightKg"],
    diagnosisFavourites: [
      "Low back pain",
      "Osteoarthritis — knee",
      "Fracture follow-up",
      "Soft tissue sprain",
      "Frozen shoulder",
    ],
    modules: NO_MODULES,
  },
};

/** Used only when a doctor's specialty string is not (yet) in the registry. */
const FALLBACK_PACK: SpecialtyPack = {
  vitalKeys: ["tempC", "bp", "pulse", "weightKg"],
  diagnosisFavourites: [],
  modules: NO_MODULES,
};

export type ResolvedVitalField = VitalFieldMeta & { key: string };

export type ResolvedSpecialtyPack = {
  vitalFields: ResolvedVitalField[];
  diagnosisFavourites: string[];
  modules: SpecialtyModules;
};

/** The shape stored in doctors.templatePack (all optional — a doctor may
    override nothing, a field, or every field). */
export type TemplatePackOverride = {
  vitals?: string[];
  diagnosisFavourites?: string[];
};

/**
 * The one resolver every specialty-aware screen reads through. Registry
 * defaults for the doctor's specialty, deep-merged with that doctor's own
 * templatePack override — never the other way around, and never bypassed by
 * a screen reading SPECIALTY_REGISTRY directly.
 */
export function resolveSpecialtyPack(
  specialty: string | null | undefined,
  override?: TemplatePackOverride | null,
): ResolvedSpecialtyPack {
  const base =
    (specialty && SPECIALTY_REGISTRY[specialty]) || FALLBACK_PACK;

  const vitalKeys = override?.vitals ?? base.vitalKeys;
  const diagnosisFavourites =
    override?.diagnosisFavourites ?? base.diagnosisFavourites;

  return {
    vitalFields: vitalKeys.map((key) => ({
      key,
      ...(VITAL_FIELD_CATALOG[key] ?? { label: key, unit: "" }),
    })),
    diagnosisFavourites,
    modules: base.modules,
  };
}
