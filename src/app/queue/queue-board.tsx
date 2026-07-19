"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { maskPhone } from "@/components/ui/identity-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  StatusPill,
  TOKEN_STATE_LABEL,
  TokenBadge,
} from "@/components/ui/status";
import type { QueueEntry } from "@/db/queries/queue";
import { ageLabel, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

/* Scenario date — becomes the real clock once the seed uses live dates. */
const TODAY = "2026-07-18";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  registrationNo: string | null;
  qualification: string | null;
};

/**
 * The interactive half of the queue screen. Receives already-fetched rows so
 * nothing here touches the database.
 */
export function QueueBoard({
  queue,
  doctors,
}: {
  queue: QueueEntry[];
  doctors: Doctor[];
}) {
  const [doctorId, setDoctorId] = useState(doctors[0].id);

  /* Already sorted by the query — priority first, then token number. */
  const entries = queue.filter((e) => e.doctorId === doctorId);
  const active = entries.find((e) => e.state === "with_doctor");
  const waiting = entries.filter((e) => e.state !== "with_doctor");

  return (
    <>
      <ScreenHeader
        title="Queue"
        subtitle={`${entries.length} in queue · Tuesday, 18 July`}
      />

      <SegmentedControl
        className="mb-5"
        value={doctorId}
        onChange={setDoctorId}
        options={doctors.map((d) => ({
          value: d.id,
          label: d.name.replace("Dr. ", "Dr "),
          badge: queue.filter((e) => e.doctorId === d.id).length,
        }))}
      />

      {active ? (
        <div className="mb-6">
          <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
            In consultation
          </p>
          <QueueCard entry={active} isActive />
        </div>
      ) : null}

      <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
        Up next
      </p>

      {waiting.length === 0 ? (
        <EmptyState
          title="No one waiting"
          hint="Tokens issued at reception appear here automatically, with vitals attached once the nurse records them."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {waiting.map((entry) => (
            <QueueCard key={entry.tokenId} entry={entry} />
          ))}
        </div>
      )}
    </>
  );
}

function QueueCard({
  entry,
  isActive = false,
}: {
  entry: QueueEntry;
  isActive?: boolean;
}) {
  const state = TOKEN_STATE_LABEL[entry.state] ?? {
    label: entry.state,
    tone: "neutral" as const,
  };
  const hasAllergy = entry.allergies.length > 0;

  return (
    <Card className={cn("p-4", isActive && "ring-2 ring-inset ring-accent/30")}>
      <div className="flex items-start gap-4">
        <TokenBadge
          number={entry.number}
          isPriority={entry.isPriority}
          size={isActive ? "lg" : "md"}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/patients/${entry.patientId}`}
              className="text-[18px] font-bold tracking-[-0.015em] text-ink underline-offset-4 hover:underline"
            >
              {entry.patientName}
            </Link>
            {entry.isPriority ? (
              <StatusPill tone="alert">Priority</StatusPill>
            ) : null}
          </div>

          <p className="mt-0.5 text-[14px] text-ink-secondary">
            {ageLabel(entry, TODAY)} · {titleCase(entry.patientSex)} ·{" "}
            {/* Masked: the queue is visible across the counter (§8.3 rule 5). */}
            {maskPhone(entry.patientPhone)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={state.tone}>{state.label}</StatusPill>
            {entry.state === "waiting" || entry.state === "vitals_done" ? (
              <span className="tabular text-[13px] font-medium text-ink-secondary">
                waiting {entry.waitingMinutes}m
              </span>
            ) : null}
          </div>

          {entry.vitals ? (
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {Object.entries(entry.vitals).map(([key, value]) => {
                const isFever = key === "tempC" && Number(value) >= 38;
                return (
                  <div key={key}>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
                      {VITAL_LABEL[key] ?? key}
                    </dt>
                    <dd
                      className={cn(
                        "tabular text-[17px] font-bold",
                        isFever ? "text-alert" : "text-ink",
                      )}
                    >
                      {value}
                      {VITAL_UNIT[key] ? ` ${VITAL_UNIT[key]}` : ""}
                      {isFever ? (
                        <span className="ml-1.5 text-[12px] font-semibold">
                          fever
                        </span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="mt-3 text-[14px] text-ink-secondary">
              Vitals not recorded yet
            </p>
          )}
        </div>
      </div>

      {hasAllergy ? (
        <div className="mt-3">
          <AlertBanner title={`Allergy — ${entry.allergies.join(", ")}`} />
        </div>
      ) : null}

      {entry.state === "waiting" ? (
        <div className="mt-4">
          <Link href={`/vitals/${entry.patientId}?visitId=${entry.visitId}`}>
            <PrimaryButton>Record vitals</PrimaryButton>
          </Link>
        </div>
      ) : null}

      {isActive ? (
        <div className="mt-4">
          <Link href={`/consult/${entry.patientId}?visitId=${entry.visitId}`}>
            <PrimaryButton>Open consultation</PrimaryButton>
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

/* Vitals are a keyed bag driven by the specialty template, so the display
   labels live here rather than in the database. */
const VITAL_LABEL: Record<string, string> = {
  tempC: "Temp",
  weightKg: "Weight",
  heightCm: "Height",
  spo2: "SpO₂",
  bp: "BP",
  pulse: "Pulse",
};

const VITAL_UNIT: Record<string, string> = {
  tempC: "°C",
  weightKg: "kg",
  heightCm: "cm",
  spo2: "%",
};
