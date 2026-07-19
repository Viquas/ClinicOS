"use client";

import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";

/**
 * Onboarding wizard (§7.12) — clinic live in under 30 minutes.
 *
 * The target is what shapes the design: every step has a working default, and
 * the specialty choice seeds the template pack AND the starter formulary. A
 * clinic that clicks through accepting defaults ends up with a usable system;
 * the alternative — an empty formulary they must key in before dispensing
 * anything — is where onboarding actually dies.
 */

const SPECIALTIES = [
  {
    id: "pediatrics",
    name: "Pediatrics",
    vitals: "Weight, height, head circumference, temperature",
    extras: "Growth percentiles · Vaccination schedule · Weight-based dosing",
    formulary: 42,
  },
  {
    id: "general",
    name: "General medicine",
    vitals: "BP, pulse, temperature, SpO₂, weight",
    extras: "Chronic-care tags · Follow-up cadence",
    formulary: 58,
  },
  {
    id: "gynaecology",
    name: "Gynaecology / obstetrics",
    vitals: "BP, weight, fundal height",
    extras: "ANC visit tracker · EDD calculator · Trimester reminders",
    formulary: 37,
  },
  {
    id: "dermatology",
    name: "Dermatology",
    vitals: "Minimal",
    extras: "Photo capture to record · Procedure billing",
    formulary: 29,
  },
];

const STEPS = ["Clinic", "Specialty", "Staff", "Ready"] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [specialty, setSpecialty] = useState(SPECIALTIES[0].id);
  const [invites, setInvites] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const chosen = SPECIALTIES.find((s) => s.id === specialty)!;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-6">
        <p className="text-[14px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-0.5 text-[28px] font-extrabold tracking-[-0.025em] text-ink">
          {
            [
              "Tell us about the clinic",
              "What do you practise?",
              "Who else works here?",
              "You're ready",
            ][step]
          }
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

      {step === 0 ? (
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name" placeholder="Vatsalya Child Care" />
            <Field label="Phone" placeholder="0821 246 8800" />
            <Field
              label="Address"
              placeholder="2nd Cross, Hunsur Main Road"
              full
            />
            <Field label="City" placeholder="Mysuru" />
            <Field label="Pincode" placeholder="570017" inputMode="numeric" />
            <Field
              label="Clinical Establishments Act reg. no."
              placeholder="KA/CEA/2024/11872"
              full
            />
          </div>
          <p className="mt-3 text-[13px] text-ink-secondary">
            Registration number prints on prescriptions and bills where your
            state requires it. You can add it later.
          </p>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          {SPECIALTIES.map((option) => {
            const isChosen = option.id === specialty;
            return (
              <button
                key={option.id}
                onClick={() => setSpecialty(option.id)}
                className={cn(
                  "rounded-[var(--radius-card)] bg-surface p-4 text-left shadow-soft",
                  "transition-shadow duration-150",
                  isChosen && "ring-2 ring-inset ring-accent",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[17px] font-bold text-ink">
                    {option.name}
                  </span>
                  {isChosen ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
                      <Check size={15} />
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[14px] text-ink-secondary">
                  Vitals: {option.vitals}
                </p>
                <p className="text-[14px] text-ink-secondary">
                  {option.extras}
                </p>
                <div className="mt-2">
                  <StatusPill tone="accent">
                    Seeds {option.formulary} common medicines
                  </StatusPill>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <Card className="p-5">
          <p className="text-[15px] leading-snug text-ink-secondary">
            Invite by phone number. Each person sets their own PIN when they
            accept, and you can change roles at any time.
          </p>

          <div className="mt-4 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              inputMode="tel"
              placeholder="98450 12233"
              aria-label="Staff phone number"
              className={cn(
                "min-h-[var(--touch-min)] flex-1 rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
                "text-[16px] text-ink outline-none placeholder:text-ink-secondary/55",
              )}
            />
            <SecondaryButton
              onClick={() => {
                if (!draft.trim()) return;
                setInvites((prev) => [...prev, draft.trim()]);
                setDraft("");
              }}
            >
              Add
            </SecondaryButton>
          </div>

          {invites.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {invites.map((phone, i) => (
                <li
                  key={`${phone}-${i}`}
                  className="flex items-center justify-between rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3"
                >
                  <span className="tabular text-[15px] font-medium text-ink">
                    {phone}
                  </span>
                  <StatusPill tone="accent">Invite pending</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[14px] text-ink-secondary">
              You can skip this and run solo — invite staff whenever you like.
            </p>
          )}
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="p-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Check size={28} />
          </span>
          <h2 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            {chosen.name} template applied
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {[
              `Vitals form set to: ${chosen.vitals}`,
              `${chosen.formulary} common medicines seeded into your formulary`,
              chosen.extras,
              invites.length > 0
                ? `${invites.length} staff invite${invites.length > 1 ? "s" : ""} sent`
                : "Running solo — invite staff any time from Settings",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check
                  size={17}
                  className="mt-0.5 shrink-0 text-accent"
                  aria-hidden
                />
                <span className="text-[15px] leading-snug text-ink">
                  {line}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[14px] leading-snug text-ink-secondary">
            Add batches to your formulary as stock arrives — a medicine with no
            batch can be prescribed but not dispensed.
          </p>
        </Card>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        {step > 0 ? (
          <SecondaryButton onClick={() => setStep((s) => s - 1)}>
            Back
          </SecondaryButton>
        ) : null}
        <div className="flex-1">
          <PrimaryButton
            onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
            disabled={step === STEPS.length - 1}
          >
            {step === STEPS.length - 1
              ? "Setup complete"
              : step === 2 && invites.length === 0
                ? "Skip for now"
                : "Continue"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  inputMode,
  full,
}: {
  label: string;
  placeholder: string;
  inputMode?: "numeric" | "tel";
  full?: boolean;
}) {
  return (
    <label className={cn("block", full && "sm:col-span-2")}>
      <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
        {label}
      </span>
      <input
        placeholder={placeholder}
        inputMode={inputMode}
        className={cn(
          "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
          "text-[16px] text-ink outline-none placeholder:text-ink-secondary/55",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        )}
      />
    </label>
  );
}
