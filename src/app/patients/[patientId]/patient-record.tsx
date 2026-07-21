"use client";

import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, GroupedList, Row } from "@/components/ui/card";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IdentityHeader } from "@/components/ui/identity-header";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status";
import type { PatientFileRow } from "@/db/queries/patient-files";
import type { PatientSummary, TimelineEntry } from "@/db/queries/patients";
import type { RevisionRow } from "@/db/queries/revisions";
import type { StaffRole } from "@/lib/auth/claims";
import { ageLabel, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FileText, ImageIcon, Paperclip, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { amendConsultationAction, updatePatientAction } from "./actions";

/**
 * The longitudinal record (§7.1) — every visit's vitals, diagnosis,
 * prescription, procedures and bills on one timeline.
 *
 * This is the screen that justifies the product to a doctor: the reason to
 * stop using a paper register is being able to see March from July. The
 * timeline is the default tab and reads newest-first, because that is the
 * question actually being asked ("what happened last time?").
 *
 * Vitals render from the same keyed bag the queue and consult screens use —
 * whatever the specialty template captured — rather than fixed columns.
 */
export function PatientRecord({
  patient,
  timeline,
  files,
  familyMembers,
  revisionsByVisitId,
  currentStaff,
}: {
  patient: PatientSummary;
  timeline: TimelineEntry[];
  files: PatientFileRow[];
  familyMembers: PatientSummary[];
  revisionsByVisitId: Record<string, RevisionRow[]>;
  currentStaff: { id: string; doctorId: string | null; roles: StaffRole[] };
}) {
  const [tab, setTab] = useState<"timeline" | "files" | "trends">("timeline");
  const [editingPatient, setEditingPatient] = useState(false);

  const weightSeries = [...timeline]
    .reverse()
    .map((v) => ({
      date: v.visitDate,
      value: v.vitals && typeof v.vitals.weightKg !== "undefined"
        ? Number(v.vitals.weightKg)
        : null,
    }))
    .filter((p): p is { date: string; value: number } => p.value !== null);

  /* §9's editing model: the treating doctor on that specific visit, or the
     owner — anyone else sees the "Amend" affordance nowhere in the UI, not
     just refused server-side. */
  const canAmend = (entry: TimelineEntry) =>
    currentStaff.roles.includes("owner") ||
    (currentStaff.doctorId !== null && currentStaff.doctorId === entry.doctorId);

  return (
    <>
      <IdentityHeader
        name={patient.name}
        ageLabel={ageLabel(patient)}
        sex={titleCase(patient.sex)}
        phone={patient.phone}
        maskContact={false}
        tags={patient.tags}
        trailing={
          <button
            onClick={() => setEditingPatient(true)}
            className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-surface-sunken px-3 py-2 text-[13px] font-semibold text-ink-secondary"
          >
            <Pencil size={14} />
            Correct details
          </button>
        }
      />

      {/* DPDP Act 2023 consent (§9.1) — captured once at registration and,
          until now, never shown back to anyone who might need to confirm it
          actually happened. */}
      <p className="mt-2 text-[13px] text-ink-secondary">
        {patient.consentGivenAt ? (
          <>Consent captured {formatDate(patient.consentGivenAt)}</>
        ) : (
          <span className="font-semibold text-warning">
            No consent on file
          </span>
        )}
      </p>

      {/* Rule 1: allergies above everything, on every patient-context screen. */}
      {patient.allergies.length > 0 ? (
        <div className="mt-4">
          <AlertBanner title={`Allergy — ${patient.allergies.join(", ")}`} />
        </div>
      ) : null}

      {/* One phone number holds several people — the pediatric default, not
          an edge case (§7.1). Front desk already sees this grouping while
          searching; a sibling's own record is one tap from here too. */}
      {familyMembers.length > 0 ? (
        <Card className="mt-4 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
            Family — same phone number
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {familyMembers.map((member) => (
              <Link
                key={member.id}
                href={`/patients/${member.id}`}
                className="flex items-center justify-between rounded-[var(--radius-control)] px-1 py-1.5 hover:bg-surface-sunken"
              >
                <span className="text-[15px] font-semibold text-ink">
                  {member.name}
                </span>
                <span className="text-[13px] text-ink-secondary">
                  {ageLabel(member)} · {titleCase(member.sex)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-5">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "timeline", label: "Timeline", badge: timeline.length },
            { value: "files", label: "Files", badge: files.length },
            { value: "trends", label: "Trends" },
          ]}
        />
      </div>

      <div className="mt-5">
        {tab === "timeline" ? (
          <TimelineTab
            timeline={timeline}
            patientId={patient.id}
            revisionsByVisitId={revisionsByVisitId}
            canAmend={canAmend}
          />
        ) : null}
        {tab === "files" ? <FilesTab files={files} /> : null}
        {tab === "trends" ? (
          <TrendsTab weightSeries={weightSeries} />
        ) : null}
      </div>

      {editingPatient ? (
        <EditPatientDialog patient={patient} onClose={() => setEditingPatient(false)} />
      ) : null}
    </>
  );
}

function EditPatientDialog({
  patient,
  onClose,
}: {
  patient: PatientSummary;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(patient.name);
  const [phone, setPhone] = useState(patient.phone);
  const [sex, setSex] = useState(patient.sex);
  const [dateOfBirth, setDateOfBirth] = useState(patient.dateOfBirth ?? "");
  const [guardianName, setGuardianName] = useState(patient.guardianName ?? "");
  const [allergies, setAllergies] = useState(patient.allergies.join(", "));
  const [tags, setTags] = useState(patient.tags.join(", "));
  const [reason, setReason] = useState("");

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updatePatientAction({
        patientId: patient.id,
        reason,
        edits: {
          name,
          phone,
          sex: sex as "male" | "female" | "other",
          dateOfBirth: dateOfBirth || null,
          guardianName: guardianName.trim() || null,
          allergies: allergies
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog onClose={onClose}>
      <Card className="w-full max-w-md p-5">
        <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
          Correct patient details
        </DialogTitle>
        <p className="mt-1 text-[14px] text-ink-secondary">
          Every correction is recorded with who made it and why — this is not
          a silent edit.
        </p>

        {error ? (
          <div className="mt-3">
            <AlertBanner title={error} />
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <EditField label="Name" value={name} onChange={setName} />
          <EditField label="Phone" value={phone} onChange={setPhone} />
          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              Sex
            </span>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <EditField
            label="Date of birth"
            value={dateOfBirth}
            onChange={setDateOfBirth}
            type="date"
          />
          <EditField
            label="Guardian name"
            value={guardianName}
            onChange={setGuardianName}
          />
          <EditField
            label="Allergies (comma-separated)"
            value={allergies}
            onChange={setAllergies}
          />
          <EditField
            label="Tags (comma-separated)"
            value={tags}
            onChange={setTags}
          />

          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              Reason for this correction
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. phone number was mistyped at registration"
              className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none placeholder:text-ink-secondary/60"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <div className="flex-1">
            <PrimaryButton
              disabled={reason.trim().length < 4 || isPending}
              onClick={handleSave}
            >
              {isPending ? "Saving…" : "Save correction"}
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </Dialog>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
      />
    </label>
  );
}

/* Vitals are a keyed bag driven by the specialty template — same labels as
   the queue board, kept in sync there. */
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

function TimelineTab({
  timeline,
  patientId,
  revisionsByVisitId,
  canAmend,
}: {
  timeline: TimelineEntry[];
  patientId: string;
  revisionsByVisitId: Record<string, RevisionRow[]>;
  canAmend: (entry: TimelineEntry) => boolean;
}) {
  const [amending, setAmending] = useState<TimelineEntry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (timeline.length === 0) {
    return (
      <EmptyState
        title="No visits yet"
        hint="This patient's first consultation will appear here."
      />
    );
  }

  const toggleExpanded = (visitId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(visitId)) next.delete(visitId);
      else next.add(visitId);
      return next;
    });

  return (
    <>
      <ol className="flex flex-col gap-3">
        {timeline.map((visit, index) => {
          const revisions = revisionsByVisitId[visit.visitId] ?? [];
          const isExpanded = expanded.has(visit.visitId);

          return (
            <li key={visit.visitId}>
              <Card className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                      {visit.diagnosis ?? "Visit — no diagnosis recorded"}
                    </h3>
                    {index === 0 ? (
                      <StatusPill tone="accent">Latest</StatusPill>
                    ) : null}
                    {visit.amended ? (
                      <button
                        onClick={() => toggleExpanded(visit.visitId)}
                        className="rounded-full"
                      >
                        <StatusPill tone="warning">Amended</StatusPill>
                      </button>
                    ) : null}
                  </div>
                  <time
                    dateTime={visit.visitDate}
                    className="tabular text-[14px] font-semibold text-ink-secondary"
                  >
                    {formatDate(visit.visitDate)}
                  </time>
                </div>

                <p className="mt-0.5 text-[14px] text-ink-secondary">
                  {visit.doctorName}
                </p>

                {visit.vitals ? (
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {Object.entries(visit.vitals).map(([key, value]) => {
                      const isFever = key === "tempC" && Number(value) >= 38;
                      return (
                        <div key={key}>
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
                            {VITAL_LABEL[key] ?? key}
                          </dt>
                          <dd
                            className={cn(
                              "tabular text-[16px] font-bold",
                              isFever ? "text-alert" : "text-ink",
                            )}
                          >
                            {value}
                            {VITAL_UNIT[key] ? ` ${VITAL_UNIT[key]}` : ""}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}

                {visit.advice ? (
                  <p className="mt-2.5 text-[14px] italic text-ink-secondary">
                    {visit.advice}
                  </p>
                ) : null}

                {visit.followUpDate ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                    <StatusPill>Follow-up {formatDate(visit.followUpDate)}</StatusPill>
                  </div>
                ) : null}

                {isExpanded && revisions.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
                    {revisions.map((rev) => (
                      <div key={rev.id} className="text-[13px] text-ink-secondary">
                        <span className="font-semibold text-ink">
                          Previously: {formatPreviousValues(rev.previousValues)}
                        </span>
                        <br />
                        {rev.reason} — {rev.editedByName ?? "unknown"},{" "}
                        {formatDate(rev.at.toISOString().slice(0, 10))}
                      </div>
                    ))}
                  </div>
                ) : null}

                {visit.diagnosis !== null ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3">
                    {/* A past visit is re-printable on demand — a patient who
                        lost the slip, or a pharmacy asking for a fresh copy,
                        is routine. Opens the paper view in its own tab so the
                        record stays put behind it. */}
                    <Link
                      href={`/print/rx/${visit.visitId}`}
                      target="_blank"
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-accent"
                    >
                      <Printer size={13} />
                      Print Rx
                    </Link>
                    {canAmend(visit) ? (
                      <button
                        onClick={() => setAmending(visit)}
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-accent"
                      >
                        <Pencil size={13} />
                        Amend this entry
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>

      {amending ? (
        <AmendConsultationDialog
          patientId={patientId}
          entry={amending}
          onClose={() => setAmending(null)}
        />
      ) : null}
    </>
  );
}

function AmendConsultationDialog({
  patientId,
  entry,
  onClose,
}: {
  patientId: string;
  entry: TimelineEntry;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState(entry.diagnosis ?? "");
  const [advice, setAdvice] = useState(entry.advice ?? "");
  const [followUpDate, setFollowUpDate] = useState(entry.followUpDate ?? "");
  const [reason, setReason] = useState("");

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await amendConsultationAction({
        patientId,
        visitId: entry.visitId,
        reason,
        edits: {
          diagnosis: diagnosis.trim() || null,
          advice: advice.trim() || null,
          followUpDate: followUpDate || null,
        },
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog onClose={onClose}>
      <Card className="w-full max-w-md p-5">
        <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
          Amend {formatDate(entry.visitDate)}
        </DialogTitle>
        <p className="mt-1 text-[14px] text-ink-secondary">
          The original entry is kept, not overwritten — this becomes a
          correction on the record, visible to anyone who opens it.
        </p>

        {error ? (
          <div className="mt-3">
            <AlertBanner title={error} />
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <EditField label="Diagnosis" value={diagnosis} onChange={setDiagnosis} />
          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              Advice
            </span>
            <textarea
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              Follow-up date
            </span>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              Reason for this amendment
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. dictation software mis-transcribed the diagnosis"
              className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none placeholder:text-ink-secondary/60"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <div className="flex-1">
            <PrimaryButton
              disabled={reason.trim().length < 4 || isPending}
              onClick={handleSave}
            >
              {isPending ? "Saving…" : "Save amendment"}
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </Dialog>
  );
}

/** { diagnosis: "Acute viral fever" } → "diagnosis: Acute viral fever". */
function formatPreviousValues(values: Record<string, unknown>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value ?? "—"}`)
    .join(", ");
}

function FilesTab({ files }: { files: PatientFileRow[] }) {
  if (files.length === 0) {
    return (
      <EmptyState
        title="No attachments"
        hint="Lab reports, external prescriptions and photos uploaded from the tablet camera appear here."
      />
    );
  }

  return (
    <GroupedList>
      {files.map((file) => (
        <Row
          key={file.id}
          leading={
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-ink-secondary">
              {file.kind === "photo" ? (
                <ImageIcon size={17} />
              ) : file.kind === "lab_report" ? (
                <FileText size={17} />
              ) : (
                <Paperclip size={17} />
              )}
            </span>
          }
          title={file.label ?? file.kind.replace("_", " ")}
          subtitle={formatDate(file.createdAt.toISOString().slice(0, 10))}
        />
      ))}
    </GroupedList>
  );
}

function TrendsTab({
  weightSeries,
}: {
  weightSeries: { date: string; value: number }[];
}) {
  if (weightSeries.length < 2) {
    return (
      <EmptyState
        title="Not enough readings yet"
        hint="Trends need at least two visits with weight recorded."
      />
    );
  }

  const max = Math.max(...weightSeries.map((p) => p.value));

  return (
    <Card className="p-5">
      <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
        Weight across visits
      </h3>
      <ul className="mt-4 flex flex-col gap-3">
        {weightSeries.map((point) => (
          <li key={point.date} className="flex items-center gap-3">
            <span className="tabular w-[92px] shrink-0 text-[13px] text-ink-secondary">
              {formatDate(point.date)}
            </span>
            <div className="h-7 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken">
              <div
                className="h-full rounded-[var(--radius-pill)] bg-accent/75"
                style={{ width: `${(point.value / max) * 100}%` }}
              />
            </div>
            <span className="tabular w-[68px] shrink-0 text-right text-[15px] font-bold text-ink">
              {point.value} kg
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[14px] text-ink-secondary">
        Percentile band is computed at capture time on the vitals screen.
      </p>
    </Card>
  );
}

/** 2026-05-12 → "12 May 2026". */
function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
