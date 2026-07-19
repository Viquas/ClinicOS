"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, GroupedList, Row, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill, TokenBadge } from "@/components/ui/status";
import type { PatientSummary } from "@/db/queries/patients";
import { ageLabel, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  issueTokenAction,
  registerPatientAction,
  searchAction,
} from "./actions";

type Doctor = { id: string; name: string };

type Issued = {
  key: string;
  patientName: string;
  doctorName: string;
  number: number;
};

/**
 * Reception (§3 goal 1: walk-in to token in under 60 seconds).
 *
 * Search runs against the database on a debounce rather than filtering a
 * preloaded list. A clinic with 8,000 patients cannot ship the register to
 * the browser, and phone-substring matching belongs in SQL anyway.
 */
export function ReceptionDesk({ doctors }: { doctors: Doctor[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [issued, setIssued] = useState<Issued[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");

  /*
   * Debounced in the change handler rather than an effect. Setting state from
   * an effect that watches `query` trips react-hooks/set-state-in-effect, and
   * the rule is right: the search is a consequence of the user typing, which
   * is an event, not of the render.
   *
   * 250ms is long enough to skip most intermediate keystrokes and short
   * enough that front desk does not feel a lag with a patient at the counter.
   */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (next: string) => {
    setQuery(next);

    if (timerRef.current) clearTimeout(timerRef.current);

    const term = next.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const found = await searchAction(term);
        setResults(found);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  /* Cancel a pending search on unmount so it cannot set state afterwards. */
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const families = new Map<string, PatientSummary[]>();
  for (const p of results) {
    families.set(p.phone, [...(families.get(p.phone) ?? []), p]);
  }

  const [registering, setRegistering] = useState(false);

  const issueForPatient = async (patient: { id: string; name: string }) => {
    const result = await issueTokenAction(patient.id, doctorId);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setIssued((prev) => [
      {
        key: result.tokenId,
        patientName: patient.name,
        doctorName: doctors.find((d) => d.id === doctorId)?.name ?? "the doctor",
        number: result.number,
      },
      ...prev,
    ]);
    handleQueryChange("");
  };

  const handleIssue = (patient: PatientSummary) => {
    setError(null);
    startTransition(() => issueForPatient(patient));
  };

  return (
    <>
      <ScreenHeader
        title="Reception"
        subtitle="Search by phone, or register a new patient"
      />

      {doctors.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
            Issue for
          </span>
          {doctors.map((d) => (
            <button
              key={d.id}
              onClick={() => setDoctorId(d.id)}
              className={cn(
                "min-h-[40px] rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold",
                d.id === doctorId
                  ? "bg-accent text-accent-ink"
                  : "bg-surface-sunken text-ink-secondary",
              )}
            >
              {d.name.replace("Dr. ", "Dr ")}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      <Card className="mb-5 flex items-center gap-3 px-4">
        <Search size={20} className="shrink-0 text-ink-secondary" />
        <input
          autoFocus
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          inputMode="tel"
          placeholder="Phone number or name"
          aria-label="Search patients by phone or name"
          className={cn(
            "tabular min-h-[var(--touch-primary)] w-full bg-transparent",
            "text-[19px] font-medium tracking-[-0.01em] text-ink",
            "outline-none placeholder:font-normal placeholder:text-ink-secondary/60",
          )}
        />
        {query ? (
          <SecondaryButton onClick={() => handleQueryChange("")}>
            Clear
          </SecondaryButton>
        ) : null}
      </Card>

      {query.trim().length >= 2 ? (
        searching ? (
          <p className="px-1 text-[15px] text-ink-secondary">Searching…</p>
        ) : results.length > 0 ? (
          <div className="mb-6 flex flex-col gap-5">
            {[...families.entries()].map(([phone, members]) => (
              <div key={phone}>
                <SectionLabel>
                  {phone}
                  {members.length > 1
                    ? ` · ${members.length} family members`
                    : ""}
                </SectionLabel>
                <GroupedList>
                  {members.map((p) => (
                    <Row
                      key={p.id}
                      onClick={isPending ? undefined : () => handleIssue(p)}
                      title={p.name}
                      subtitle={`${ageLabel(p)} · ${titleCase(p.sex)}${
                        p.guardianName ? ` · c/o ${p.guardianName}` : ""
                      }`}
                      trailing={
                        <div className="flex items-center gap-2">
                          {p.allergies.length > 0 ? (
                            <StatusPill tone="alert">Allergy</StatusPill>
                          ) : null}
                          <span className="text-[15px] font-semibold text-accent">
                            {isPending ? "Issuing…" : "Issue token"}
                          </span>
                        </div>
                      }
                    />
                  ))}
                </GroupedList>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <EmptyState
              title={`No patient matching “${query}”`}
              hint="Register them as a new patient — name, phone, age, sex, and guardian if a minor."
              action={
                <PrimaryButton onClick={() => setRegistering(true)}>
                  Register new patient
                </PrimaryButton>
              }
            />
          </div>
        )
      ) : null}

      {issued.length > 0 ? (
        <div>
          <SectionLabel>Issued just now</SectionLabel>
          <div className="flex flex-col gap-3">
            {issued.map((entry) => (
              <Card key={entry.key} className="flex items-center gap-4 p-4">
                <TokenBadge number={entry.number} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold text-ink">
                    {entry.patientName}
                  </p>
                  <p className="text-[14px] text-ink-secondary">
                    {entry.doctorName}
                  </p>
                </div>
                <StatusPill tone="success">In queue</StatusPill>
              </Card>
            ))}
          </div>
        </div>
      ) : query.trim().length < 2 ? (
        <EmptyState
          title="Ready for the next patient"
          hint="Type the last four digits of a phone number to pull up a returning patient and their family."
        />
      ) : null}

      {registering ? (
        <RegisterPatientDialog
          initialPhone={/^\d+$/.test(query.trim()) ? query.trim() : ""}
          onClose={() => setRegistering(false)}
          onRegistered={(patient) => {
            setRegistering(false);
            startTransition(() => issueForPatient(patient));
          }}
        />
      ) : null}
    </>
  );
}

function RegisterPatientDialog({
  initialPhone,
  onClose,
  onRegistered,
}: {
  initialPhone: string;
  onClose: () => void;
  onRegistered: (patient: { id: string; name: string }) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [sex, setSex] = useState<"male" | "female" | "other">("male");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [guardianName, setGuardianName] = useState("");

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await registerPatientAction({
        name,
        phone,
        sex,
        dateOfBirth: dateOfBirth || null,
        ageYears: ageYears ? Number(ageYears) : null,
        guardianName: guardianName.trim() || null,
      });

      if (result.ok) {
        onRegistered({ id: result.patientId, name: name.trim() });
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Card className="w-full max-w-md p-5">
        <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
          Register new patient
        </h2>
        <p className="mt-1 text-[14px] text-ink-secondary">
          A date of birth or an age is required — either is enough.
        </p>

        {error ? (
          <div className="mt-3">
            <AlertBanner title={error} />
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <RegisterField label="Name" value={name} onChange={setName} />
          <RegisterField
            label="Phone"
            value={phone}
            onChange={setPhone}
            inputMode="tel"
          />

          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              Sex
            </span>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as typeof sex)}
              className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <RegisterField
              label="Date of birth"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              placeholder="YYYY-MM-DD"
            />
            <RegisterField
              label="Age (years)"
              value={ageYears}
              onChange={setAgeYears}
              inputMode="numeric"
            />
          </div>

          <RegisterField
            label="Guardian name (if a minor)"
            value={guardianName}
            onChange={setGuardianName}
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <div className="flex-1">
            <PrimaryButton
              disabled={
                isPending ||
                name.trim().length < 2 ||
                phone.replace(/\D/g, "").length !== 10 ||
                (!dateOfBirth && !ageYears)
              }
              onClick={handleSave}
            >
              {isPending ? "Registering…" : "Register & issue token"}
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
}

function RegisterField({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "tel" | "numeric";
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none placeholder:text-ink-secondary/60"
      />
    </label>
  );
}
