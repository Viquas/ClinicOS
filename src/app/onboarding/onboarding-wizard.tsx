"use client";

import { Card } from "@/components/ui/card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import {
  SPECIALTY_REGISTRY,
  VITAL_FIELD_CATALOG,
} from "@/lib/clinical/specialties";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClinicAction } from "./actions";

/**
 * Onboarding wizard (§7.12) — a clinic live in one pass.
 *
 * This screen used to be a mock: the clinic fields were placeholders bound to
 * nothing, the specialty list was four hardcoded entries that did not match
 * the six the app actually supports, it advertised seeding "42 common
 * medicines" that no code seeded, and finishing wrote nothing anywhere. It
 * now creates a real clinic, owner and doctor record, then switches the
 * device into that clinic.
 *
 * The specialty step reads SPECIALTY_REGISTRY directly rather than
 * describing it in prose, so what the wizard promises and what the app then
 * does cannot drift apart — the vitals fields and modules listed here are
 * literally the ones the new clinic will get.
 *
 * Every step past the first is optional to fill: §7.12's target is a working
 * clinic in under thirty minutes, and a wizard that blocks on a GSTIN or a
 * council registration number the owner does not have to hand is where
 * onboarding actually dies. Only the clinic name, the owner's name and their
 * phone are required.
 */

const SPECIALTY_LABELS: Record<string, string> = {
  pediatrics: "Pediatrics",
  general_medicine: "General medicine",
  gynecology: "Gynaecology / obstetrics",
  dermatology: "Dermatology",
  diabetology: "Diabetology",
  orthopedics: "Orthopaedics",
};

const MODULE_LABELS: Record<string, string> = {
  growthTrends: "Growth charts",
  vaccinations: "Vaccination schedule",
};

const STEPS = ["Clinic", "Specialty", "Owner", "Review"] as const;

const HEADINGS = [
  "Tell us about the clinic",
  "What do you practise?",
  "Who runs this clinic?",
  "Ready to go",
];

export function OnboardingWizard() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [cea, setCea] = useState("");
  const [isGstRegistered, setIsGstRegistered] = useState(false);
  const [gstin, setGstin] = useState("");

  const [specialty, setSpecialty] = useState("pediatrics");

  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [qualification, setQualification] = useState("");
  const [isDoctor, setIsDoctor] = useState(true);
  const [registrationNo, setRegistrationNo] = useState("");
  const [registrationCouncil, setRegistrationCouncil] = useState("");

  const pack = SPECIALTY_REGISTRY[specialty];

  const canLeaveClinic = name.trim().length >= 2;
  const canLeaveOwner =
    ownerName.trim().length >= 2 && ownerPhone.replace(/\D/g, "").length === 10;

  const handleFinish = () => {
    setError(null);
    startTransition(async () => {
      const result = await createClinicAction({
        name,
        phone,
        addressLine,
        city,
        pincode,
        ceaRegistrationNo: cea,
        isGstRegistered,
        gstin,
        primarySpecialty: specialty,
        owner: {
          name: ownerName,
          phone: ownerPhone,
          qualification,
          isDoctor,
          registrationNo,
          registrationCouncil,
        },
      });

      if (result.ok) {
        /* refresh() so the layout re-resolves the new clinic and owner from
           the cookies the action just set, rather than rendering the demo
           clinic from cache. */
        router.refresh();
        router.push("/home");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-6">
        <p className="text-[14px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-0.5 text-[28px] font-extrabold tracking-[-0.025em] text-ink">
          {HEADINGS[step]}
        </h1>

        <ol className="mt-4 flex gap-2">
          {STEPS.map((label, index) => (
            <li key={label} className="flex-1">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-colors duration-200",
                  index <= step ? "bg-accent" : "bg-surface-sunken",
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block text-[12px] font-semibold",
                  index <= step ? "text-accent" : "text-ink-secondary",
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      </header>

      {error ? (
        <div className="mb-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      {step === 0 ? (
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Clinic name"
              value={name}
              onChange={setName}
              placeholder="Vatsalya Child Care"
              full
            />
            <Field
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="0821 246 8800"
              inputMode="tel"
            />
            <Field
              label="City"
              value={city}
              onChange={setCity}
              placeholder="Mysuru"
            />
            <Field
              label="Address"
              value={addressLine}
              onChange={setAddressLine}
              placeholder="2nd Cross, Hunsur Main Road"
              full
            />
            <Field
              label="Pincode"
              value={pincode}
              onChange={setPincode}
              placeholder="570017"
              inputMode="numeric"
            />
            <Field
              label="Clinical Establishments Act reg. no."
              value={cea}
              onChange={setCea}
              placeholder="KA/CEA/2024/11872"
            />
          </div>

          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={isGstRegistered}
              onChange={(e) => setIsGstRegistered(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[var(--accent)]"
            />
            <span className="text-[15px] text-ink">
              This clinic is GST registered
              <span className="mt-0.5 block text-[13px] text-ink-secondary">
                Medicines are taxable, consultations are exempt — bills split
                the two automatically.
              </span>
            </span>
          </label>

          {isGstRegistered ? (
            <div className="mt-3">
              <Field
                label="GSTIN"
                value={gstin}
                onChange={setGstin}
                placeholder="29ABCDE1234F1Z5"
                full
              />
            </div>
          ) : null}

          <p className="mt-3 text-[13px] text-ink-secondary">
            Only the clinic name is required now — everything else can be
            added later in Settings.
          </p>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          {Object.entries(SPECIALTY_REGISTRY).map(([id, option]) => {
            const isChosen = id === specialty;
            const modules = Object.entries(option.modules)
              .filter(([, on]) => on)
              .map(([key]) => MODULE_LABELS[key]);

            return (
              <button
                key={id}
                onClick={() => setSpecialty(id)}
                aria-pressed={isChosen}
                className={cn(
                  "rounded-[var(--radius-card)] bg-surface p-4 text-left shadow-soft",
                  "transition-shadow duration-150",
                  isChosen && "ring-2 ring-inset ring-accent",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[17px] font-bold text-ink">
                    {SPECIALTY_LABELS[id] ?? id}
                  </span>
                  {isChosen ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
                      <Check size={15} />
                    </span>
                  ) : null}
                </div>

                {/* Read straight from the pack the clinic will actually get. */}
                <p className="mt-1 text-[14px] text-ink-secondary">
                  Vitals:{" "}
                  {option.vitalKeys
                    .map((k) => VITAL_FIELD_CATALOG[k]?.label ?? k)
                    .join(", ")}
                </p>
                <p className="text-[14px] text-ink-secondary">
                  {option.diagnosisFavourites.length} diagnosis shortcuts
                </p>

                {modules.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {modules.map((m) => (
                      <StatusPill key={m} tone="accent">
                        {m}
                      </StatusPill>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              value={ownerName}
              onChange={setOwnerName}
              placeholder="Dr. Sameera Rahman"
            />
            <Field
              label="Phone"
              value={ownerPhone}
              onChange={setOwnerPhone}
              placeholder="98450 01122"
              inputMode="tel"
            />
            <Field
              label="Qualification"
              value={qualification}
              onChange={setQualification}
              placeholder="MBBS, MD (Paediatrics)"
              full
            />
          </div>

          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={isDoctor}
              onChange={(e) => setIsDoctor(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[var(--accent)]"
            />
            <span className="text-[15px] text-ink">
              I see patients myself
              <span className="mt-0.5 block text-[13px] text-ink-secondary">
                Leave unticked if you manage the clinic without consulting.
              </span>
            </span>
          </label>

          {isDoctor ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Registration number"
                value={registrationNo}
                onChange={setRegistrationNo}
                placeholder="KMC 78412"
              />
              <Field
                label="Registration council"
                value={registrationCouncil}
                onChange={setRegistrationCouncil}
                placeholder="Karnataka Medical Council"
              />
              <p className="text-[13px] text-ink-secondary sm:col-span-2">
                Required on every prescription. You can add it later — until
                then prescribing stays blocked and Settings will remind you.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="p-5">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Summary label="Clinic" value={name} />
            <Summary
              label="Where"
              value={[addressLine, city, pincode].filter(Boolean).join(", ") || "—"}
            />
            <Summary
              label="Specialty"
              value={SPECIALTY_LABELS[specialty] ?? specialty}
            />
            <Summary
              label="GST"
              value={isGstRegistered ? `Registered · ${gstin || "—"}` : "Not registered"}
            />
            <Summary label="Owner" value={ownerName} />
            <Summary
              label="Prescribing"
              value={
                !isDoctor
                  ? "Owner does not consult"
                  : registrationNo
                    ? `Enabled · ${registrationNo}`
                    : "Blocked until a registration number is added"
              }
            />
          </dl>

          <div className="mt-4">
            <AlertBanner
              tone="warning"
              title="This creates a new clinic"
              detail={`${
                pack.modules.vaccinations || pack.modules.growthTrends
                  ? "Growth charts and vaccination tracking are switched on for this specialty. "
                  : ""
              }You'll be signed in as ${ownerName || "the owner"} straight after.`}
            />
          </div>
        </Card>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        {step > 0 ? (
          <SecondaryButton onClick={() => setStep((s) => s - 1)}>
            Back
          </SecondaryButton>
        ) : null}

        <div className="flex-1">
          {step < STEPS.length - 1 ? (
            <PrimaryButton
              disabled={
                (step === 0 && !canLeaveClinic) || (step === 2 && !canLeaveOwner)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </PrimaryButton>
          ) : (
            <PrimaryButton disabled={isPending} onClick={handleFinish}>
              {isPending ? "Creating…" : "Create clinic"}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  full,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "tel" | "numeric";
  full?: boolean;
}) {
  return (
    <label className={cn("block", full && "sm:col-span-2")}>
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={cn(
          "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
          "text-[16px] text-ink outline-none placeholder:text-ink-secondary/55",
        )}
      />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] text-ink">{value || "—"}</dd>
    </div>
  );
}
