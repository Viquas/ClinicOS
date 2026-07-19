"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, GroupedList, Row, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import type { PatientSummary } from "@/db/queries/patients";
import { findDuplicates, type DuplicatePair } from "@/lib/patients/duplicates";
import { ageLabel, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { mergePatients } from "./actions";

/**
 * Patient directory (§7.1).
 *
 * Duplicate suggestions live here rather than at Reception because merging is
 * an administrative act, not something to do with a patient at the counter.
 */
export function PatientsBoard({ patients }: { patients: PatientSummary[] }) {
  const [query, setQuery] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;

    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [query, patients]);

  /* Group by phone so families read as families, matching how staff think. */
  const families = useMemo(() => {
    const groups = new Map<string, PatientSummary[]>();
    for (const p of results) {
      groups.set(p.phone, [...(groups.get(p.phone) ?? []), p]);
    }
    return [...groups.entries()].sort((a, b) =>
      a[1][0].name.localeCompare(b[1][0].name),
    );
  }, [results]);

  const duplicates = useMemo(
    () =>
      findDuplicates(
        /* Allergies and tags are passed so the survivor is chosen on clinical
           completeness, not alphabetically — see orderBySurvivor. */
        patients.map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          sex: p.sex,
          ageLabel: ageLabel(p),
          allergies: p.allergies,
          tags: p.tags,
          hasDateOfBirth: Boolean(p.dateOfBirth),
          hasGuardianName: Boolean(p.guardianName),
        })),
      ).filter((pair) => !dismissed.has(pairKey(pair))),
    [patients, dismissed],
  );

  const handleMerge = (pair: DuplicatePair) => {
    startTransition(async () => {
      const result = await mergePatients(pair.a.id, pair.b.id);
      setNotice(
        result.ok
          ? `Merged into ${pair.a.name}${
              result.movedVisits > 0
                ? ` · ${result.movedVisits} visit${result.movedVisits > 1 ? "s" : ""} moved`
                : ""
            }`
          : result.error,
      );
    });
  };

  return (
    <>
      <ScreenHeader title="Patients" subtitle={`${patients.length} records`} />

      {notice ? (
        <div className="mb-4">
          <AlertBanner tone="warning" title={notice} />
        </div>
      ) : null}

      <Card className="mb-5 flex items-center gap-3 px-4">
        <Search size={20} className="shrink-0 text-ink-secondary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone or tag"
          aria-label="Search patients"
          className={cn(
            "min-h-[var(--touch-primary)] w-full bg-transparent",
            "text-[18px] font-medium text-ink outline-none",
            "placeholder:font-normal placeholder:text-ink-secondary/60",
          )}
        />
        {query ? (
          <SecondaryButton onClick={() => setQuery("")}>Clear</SecondaryButton>
        ) : null}
      </Card>

      {duplicates.length > 0 && !query ? (
        <div className="mb-6">
          <SectionLabel>Possible duplicates</SectionLabel>
          <div className="flex flex-col gap-3">
            {duplicates.map((pair) => (
              <MergeCard
                key={pairKey(pair)}
                pair={pair}
                isPending={isPending}
                onMerge={() => handleMerge(pair)}
                onDismiss={() =>
                  setDismissed((prev) => new Set(prev).add(pairKey(pair)))
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {results.length === 0 ? (
        <EmptyState
          title={`No patient matching “${query}”`}
          hint="Try the last four digits of the phone number, or register them from Reception."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {families.map(([phone, members]) => (
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
                    title={
                      <Link href={`/patients/${p.id}`} className="block">
                        {p.name}
                      </Link>
                    }
                    subtitle={`${ageLabel(p)} · ${titleCase(p.sex)}${
                      p.guardianName ? ` · c/o ${p.guardianName}` : ""
                    }`}
                    trailing={
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {p.allergies.length > 0 ? (
                          <StatusPill tone="alert">Allergy</StatusPill>
                        ) : null}
                        {p.tags.map((t) => (
                          <StatusPill key={t}>{t}</StatusPill>
                        ))}
                      </div>
                    }
                  />
                ))}
              </GroupedList>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function pairKey(pair: DuplicatePair): string {
  return [pair.a.id, pair.b.id].sort().join(":");
}

function MergeCard({
  pair,
  onMerge,
  onDismiss,
  isPending,
}: {
  pair: DuplicatePair;
  onMerge: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  return (
    <Card className="p-4">
      <AlertBanner
        tone="warning"
        title={`${pair.a.name} and ${pair.b.name} may be the same person`}
        detail={pair.reasons.join(" · ")}
      />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[pair.a, pair.b].map((candidate, index) => (
          <div
            key={candidate.id}
            className="rounded-[var(--radius-control)] bg-surface-sunken p-3.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-ink">
                {candidate.name}
              </span>
              {index === 0 ? <StatusPill tone="accent">Keep</StatusPill> : null}
            </div>
            <p className="text-[13px] text-ink-secondary">
              {candidate.ageLabel} · {titleCase(candidate.sex)} ·{" "}
              {candidate.phone}
            </p>
          </div>
        ))}
      </div>

      {/* States exactly what survives — this is the one action here that
          cannot be walked back. */}
      <p className="mt-3 text-[14px] leading-snug text-ink-secondary">
        Visits, prescriptions and bills from <strong>{pair.b.name}</strong> move
        onto <strong>{pair.a.name}</strong>. The duplicate is archived, not
        deleted, and the merge is recorded in the audit log.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <SecondaryButton onClick={onDismiss}>Not a duplicate</SecondaryButton>
        <div className="flex-1">
          <PrimaryButton onClick={onMerge} disabled={isPending}>
            {isPending ? "Merging…" : `Merge into ${pair.a.name}`}
          </PrimaryButton>
        </div>
      </div>
    </Card>
  );
}
