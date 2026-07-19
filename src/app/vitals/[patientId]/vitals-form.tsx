"use client";

import { AlertBanner } from "@/components/ui/alert-banner";
import { IdentityHeader } from "@/components/ui/identity-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import { VitalsInput } from "@/components/ui/vitals-input";
import { percentileNote } from "@/lib/clinical/growth";
import { checkRange } from "@/lib/clinical/ranges";
import type { ResolvedVitalField } from "@/lib/clinical/specialties";
import { ageLabel, monthsBetween, titleCase } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordVitalsAction } from "./actions";

/* Scenario date — becomes the real clock once the seed uses live dates. */

type Patient = {
  id: string;
  name: string;
  phone: string;
  sex: string;
  dateOfBirth: string | null;
  ageYears: number | null;
  allergies: string[];
};

/**
 * Vitals capture (§7.3), driven by the treating doctor's specialty template.
 *
 * The field list, and whether a growth-percentile note appears at all, come
 * from the specialty resolver (lib/clinical/specialties.ts) — swapping the
 * doctor's specialty swaps this screen with no code change here.
 */
export function VitalsForm({
  today,
  visitId,
  tokenId,
  patient,
  vitalFields,
  showGrowthTrend,
  priorValues,
}: {
  /* The clinic's date, resolved on the server and passed down so an
     age label cannot disagree between server and client render. */
  today: string;
  visitId: string;
  tokenId: string;
  patient: Patient;
  vitalFields: ResolvedVitalField[];
  showGrowthTrend: boolean;
  priorValues: Record<string, string | number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(vitalFields.map((f) => [f.key, ""])),
  );
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const ageMonths = patient.dateOfBirth
    ? monthsBetween(patient.dateOfBirth, today)
    : undefined;

  const toggleSkip = (key: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        /* Skipping clears the value — a skipped field with a number in it is
           an ambiguous record, and ambiguity is what rule 3 exists to kill. */
        setValues((v) => ({ ...v, [key]: "" }));
      }
      return next;
    });

  const anyRecorded = vitalFields.some(
    (f) => values[f.key]?.trim() !== "" || skipped.has(f.key),
  );

  const growthNote = showGrowthTrend
    ? percentileNote({
        ageMonths,
        sex: titleCase(patient.sex) as "Male" | "Female",
        weightKg: parseFloat(values.weightKg),
      })
    : undefined;

  const handleSave = () => {
    setError(null);
    const recordedValues: Record<string, number> = {};
    for (const field of vitalFields) {
      if (skipped.has(field.key)) continue;
      const parsed = parseFloat(values[field.key]);
      if (Number.isFinite(parsed)) recordedValues[field.key] = parsed;
    }

    startTransition(async () => {
      const result = await recordVitalsAction({
        visitId,
        tokenId,
        values: recordedValues,
        skipped: [...skipped],
      });
      if (result.ok) {
        router.push("/queue");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <IdentityHeader
        name={patient.name}
        ageLabel={ageLabel(patient, today)}
        sex={titleCase(patient.sex)}
        phone={patient.phone}
      />

      {patient.allergies.length > 0 ? (
        <div className="mt-4">
          <AlertBanner
            title={`Allergy — ${patient.allergies.join(", ")}`}
            detail="Carried through to the prescription screen."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {vitalFields.map((field) => {
          const raw = values[field.key] ?? "";
          const range = checkRange(field.key, parseFloat(raw), { ageMonths });
          const prior = priorValues[field.key];

          return (
            <VitalsInput
              key={field.key}
              label={field.label}
              unit={field.unit}
              inputMode={field.inputMode ?? "decimal"}
              value={raw}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
              priorValue={
                prior !== undefined ? `${prior} ${field.unit}`.trim() : undefined
              }
              isSkipped={skipped.has(field.key)}
              onToggleSkip={() => toggleSkip(field.key)}
              outOfRangeNote={range}
            />
          );
        })}
      </div>

      {growthNote ? (
        <div className="mt-3 flex items-center gap-2 px-1">
          <StatusPill tone={growthNote.tone}>{growthNote.label}</StatusPill>
          <span className="text-[14px] text-ink-secondary">{growthNote.detail}</span>
        </div>
      ) : null}

      <div className="mt-6">
        <PrimaryButton disabled={!anyRecorded || isPending} onClick={handleSave}>
          {isPending ? "Saving…" : "Save vitals & return to queue"}
        </PrimaryButton>
        <p className="mt-2 text-center text-[13px] text-ink-secondary">
          {/* Rule 4: out-of-range never blocks the save. */}
          Out-of-range values can still be saved — flag them, don&apos;t block them.
        </p>
      </div>
    </>
  );
}
