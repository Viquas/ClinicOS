"use client";

import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status";
import { ScreenHeader } from "@/components/screen-header";
import type { ChildVaccinationRow } from "@/db/queries/vaccinations";
import type { ScheduledDose } from "@/lib/clinical/vaccines";
import { cn } from "@/lib/utils";
import { whatsAppLink } from "@/lib/whatsapp";
import { Printer, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { recordDoseAction } from "./actions";

/**
 * Vaccination module (§7.6 P1).
 *
 * Two views for two jobs: "who do we chase this week" (clinic-wide, drives
 * WhatsApp reminders) and "what does this child need today" (per-child,
 * drives recording a dose). Both read the same server-computed roster —
 * given doses come from real completed procedure tasks, not a fixture.
 *
 * Recording a dose here is the same write path as a nurse marking any other
 * procedure done (§7.6 P0): it creates a real visit and an audited history
 * entry, so a vaccination given today shows up immediately as "given" rather
 * than needing a separate sync step.
 */
export function VaccinationsBoard({
  roster,
  doctors,
  clinicName,
}: {
  roster: ChildVaccinationRow[];
  doctors: { id: string; name: string }[];
  clinicName: string;
}) {
  const [view, setView] = useState<"due" | "child">("due");
  /* A dose is nurse-given but doctor-supervised, and the record names which
     doctor — so the nurse picks before recording rather than the app
     guessing. Defaults to the first, which is right in a single-doctor
     clinic and visible in any other. */
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [childId, setChildId] = useState(roster[0]?.patientId ?? "");
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [recorded, setRecorded] = useState<Set<string>>(new Set());

  const chasing = useMemo(
    () => roster.filter((r) => r.owed.length > 0),
    [roster],
  );
  const selected = roster.find((r) => r.patientId === childId);

  const handleRecord = (patientId: string, doseId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await recordDoseAction(patientId, doseId, doctorId);
      if (result.ok) {
        setRecorded((prev) => new Set(prev).add(`${patientId}:${doseId}`));
      } else {
        setError(result.error);
      }
    });
  };

  if (roster.length === 0) {
    return (
      <>
        <ScreenHeader title="Vaccinations" />
        <EmptyState
          title="No children on file yet"
          hint="A vaccination schedule needs a recorded date of birth — register the patient with one to see it here."
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Vaccinations"
        subtitle={`${chasing.length} children with doses due`}
      />

      {error ? (
        <div className="mb-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      {/* Only a real choice is worth a control: a single-doctor clinic has
          nothing to pick, and the dose still records against them. */}
      {doctors.length > 1 ? (
        <label className="mb-5 block">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
            Supervising doctor
          </span>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className={cn(
              "mt-1 min-h-[var(--touch-min)] w-full max-w-sm rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
              "text-[16px] text-ink outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            )}
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <SegmentedControl
        className="mb-5"
        value={view}
        onChange={setView}
        options={[
          { value: "due", label: "Due list", badge: chasing.length },
          { value: "child", label: "By child" },
        ]}
      />

      {view === "due" ? (
        chasing.length === 0 ? (
          <EmptyState
            title="Nobody is due"
            hint="Children appear here from two weeks before a dose is due, and stay until it is recorded as given."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {chasing.map((child) => {
              const overdue = child.owed.filter((d) => d.status === "overdue");
              const sent = reminded.has(child.patientId);

              return (
                <Card key={child.patientId} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                        {child.name}
                      </h3>
                      <p className="text-[14px] text-ink-secondary">
                        c/o {child.guardianName ?? "—"} · {child.phone}
                      </p>
                    </div>
                    {overdue.length > 0 ? (
                      <StatusPill tone="alert">
                        {overdue.length} overdue
                      </StatusPill>
                    ) : (
                      <StatusPill tone="warning">
                        {child.owed.length} due
                      </StatusPill>
                    )}
                  </div>

                  <ul className="mt-3 flex flex-col gap-1.5">
                    {child.owed.map((entry) => (
                      <li
                        key={entry.dose.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-[15px] font-medium text-ink">
                          {entry.dose.name}
                        </span>
                        <DosePill entry={entry} />
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center gap-3">
                    {(() => {
                      const due = child.owed.map((d) => d.dose.name).join(", ");
                      const link = whatsAppLink(
                        child.phone,
                        `Namaste${child.guardianName ? ` ${child.guardianName}` : ""}, a reminder from ${clinicName}: ${child.name}'s vaccination${child.owed.length > 1 ? "s" : ""} (${due}) ${child.owed.length > 1 ? "are" : "is"} due. Please visit at your convenience.`,
                      );
                      if (!link) {
                        return (
                          <StatusPill tone="neutral">No phone on file</StatusPill>
                        );
                      }
                      return (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            setReminded((prev) =>
                              new Set(prev).add(child.patientId),
                            )
                          }
                          className="flex min-h-[var(--touch-min)] items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-5 text-[15px] font-semibold text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <Send size={17} />
                          {sent ? "Open reminder again" : "Send WhatsApp reminder"}
                        </a>
                      );
                    })()}
                    {sent ? (
                      <StatusPill tone="success">Reminder opened</StatusPill>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {roster.map((child) => (
              <button
                key={child.patientId}
                onClick={() => setChildId(child.patientId)}
                className={cn(
                  "min-h-[44px] rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  child.patientId === childId
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-sunken text-ink-secondary",
                )}
              >
                {child.name}
              </button>
            ))}
          </div>

          {selected ? (
            <>
              {selected.owed.length > 0 ? (
                <div className="mb-4">
                  <AlertBanner
                    tone={
                      selected.owed.some((d) => d.status === "overdue")
                        ? "alert"
                        : "warning"
                    }
                    title={`${selected.owed.length} dose${
                      selected.owed.length > 1 ? "s" : ""
                    } outstanding`}
                    detail={selected.owed.map((d) => d.dose.name).join(", ")}
                  />
                </div>
              ) : null}

              <SectionLabel>Schedule</SectionLabel>
              <Card className="overflow-hidden">
                <ol>
                  {selected.schedule.map((entry) => {
                    const key = `${selected.patientId}:${entry.dose.id}`;
                    const justRecorded = recorded.has(key);
                    const canRecord =
                      !justRecorded &&
                      (entry.status === "due" || entry.status === "overdue");

                    return (
                      <li
                        key={entry.dose.id}
                        className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-[15px] font-semibold",
                              entry.status === "given"
                                ? "text-ink-secondary"
                                : "text-ink",
                            )}
                          >
                            {entry.dose.name}
                          </p>
                          <p className="tabular text-[13px] text-ink-secondary">
                            {entry.status === "given"
                              ? `Given ${entry.givenOn}`
                              : `Due ${entry.dueDate}`}
                          </p>
                        </div>
                        {canRecord ? (
                          <button
                            disabled={isPending}
                            onClick={() =>
                              handleRecord(selected.patientId, entry.dose.id)
                            }
                            className="min-h-[44px] rounded-[var(--radius-pill)] bg-accent px-4 text-[13px] font-semibold text-accent-ink transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            Record given
                          </button>
                        ) : justRecorded ? (
                          <StatusPill tone="success">Given today</StatusPill>
                        ) : (
                          <DosePill entry={entry} />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </Card>

              <div className="mt-5 flex items-center gap-3">
                <Link
                  href={`/print/vaccines/${selected.patientId}`}
                  target="_blank"
                  className="flex min-h-[var(--touch-min)] items-center gap-2 rounded-[var(--radius-control)] px-4 text-[16px] font-semibold text-accent transition-opacity active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Printer size={18} />
                  Print schedule card
                </Link>
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function DosePill({ entry }: { entry: ScheduledDose }) {
  if (entry.status === "given") {
    return <StatusPill tone="success">Given</StatusPill>;
  }
  if (entry.status === "overdue") {
    return (
      <StatusPill tone="alert">
        Overdue {Math.abs(entry.daysUntilDue)}d
      </StatusPill>
    );
  }
  if (entry.status === "due") {
    return (
      <StatusPill tone="warning">
        {entry.daysUntilDue >= 0
          ? `Due in ${entry.daysUntilDue}d`
          : `Late ${Math.abs(entry.daysUntilDue)}d`}
      </StatusPill>
    );
  }
  return <StatusPill>Upcoming</StatusPill>;
}
