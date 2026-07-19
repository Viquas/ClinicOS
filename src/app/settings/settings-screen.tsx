"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, GroupedList, Row, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status";
import type { StaffRow } from "@/db/queries/staff";
import { describeAudit } from "@/lib/audit/describe";
import { clinic } from "@/lib/mock/data";
import {
  getServerTheme,
  getStoredTheme,
  setStoredTheme,
  subscribeTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

type AuditEntry = {
  id: string;
  at: string;
  actorName: string | null;
  action: string;
  detail: unknown;
};

/**
 * Settings (§7.8, §7.12).
 *
 * Clinic profile and Night OPD stay as static/local concerns; staff and the
 * audit trail now read from the database. The audit tab is the one that earns
 * its place — it shows the real, append-only record of everything that has
 * happened, which is exactly what §7.8 requires and what an inspector asks for.
 */
export function SettingsScreen({
  staff,
  currentStaffId,
  audit,
}: {
  staff: StaffRow[];
  currentStaffId: string;
  audit: AuditEntry[];
}) {
  return (
    <>
      <ScreenHeader title="Settings" subtitle={clinic.name} />
      <Tabs staff={staff} currentStaffId={currentStaffId} audit={audit} />
    </>
  );
}

type Tab = "clinic" | "staff" | "audit";

function Tabs({
  staff,
  currentStaffId,
  audit,
}: {
  staff: StaffRow[];
  currentStaffId: string;
  audit: AuditEntry[];
}) {
  const [tab, setTab] = useState<Tab>("clinic");
  const currentStaff = staff.find((s) => s.id === currentStaffId);

  return (
    <>
      {currentStaff ? (
        <Card className="mb-5 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
              Signed in as
            </p>
            <p className="truncate text-[17px] font-bold text-ink">
              {currentStaff.name}
            </p>
            <p className="truncate text-[13px] text-ink-secondary">
              {currentStaff.roles.map((r) => r.replace("_", " ")).join(" · ")}
            </p>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-[var(--radius-pill)] bg-surface-sunken px-4 py-2 text-[14px] font-semibold text-accent"
          >
            Switch user
          </Link>
        </Card>
      ) : null}

      <SegmentedControl
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "clinic", label: "Clinic" },
          { value: "staff", label: "Staff", badge: staff.length },
          { value: "audit", label: "Audit", badge: audit.length },
        ]}
      />

      {tab === "clinic" ? <ClinicTab /> : null}
      {tab === "staff" ? (
        <StaffTab staff={staff} currentStaffId={currentStaffId} />
      ) : null}
      {tab === "audit" ? <AuditTab audit={audit} /> : null}
    </>
  );
}

function ThemeControl() {
  const mode = useSyncExternalStore(
    subscribeTheme,
    getStoredTheme,
    getServerTheme,
  );

  return (
    <Card className="p-5">
      <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
        Night OPD
      </h3>
      <p className="mt-1 text-[14px] leading-snug text-ink-secondary">
        Auto switches to the dark theme from 5&nbsp;pm to 6&nbsp;am on this
        device.
      </p>
      <div className="mt-4">
        <SegmentedControl
          value={mode}
          onChange={setStoredTheme}
          options={[
            { value: "auto", label: "Auto" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
    </Card>
  );
}

function ClinicTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
          Clinic profile
        </h3>
        <p className="mt-1 text-[14px] text-ink-secondary">
          Prints on every prescription and bill.
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Name" value={clinic.name} />
          <Detail
            label="Address"
            value={`${clinic.addressLine}, ${clinic.city}`}
          />
          <Detail
            label="Clinical Establishments Act reg."
            value={clinic.ceaRegistrationNo}
          />
          <Detail label="GST status" value="Registered · 29ABCDE1234F1Z5" />
        </dl>
      </Card>

      <ThemeControl />

      <Card className="p-5">
        <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
          Data &amp; consent
        </h3>
        <p className="mt-1 text-[14px] leading-snug text-ink-secondary">
          Patient data is held in the Mumbai region. Consent is captured at
          registration under the DPDP Act 2023.
        </p>
        <div className="mt-4">
          <AlertBanner
            tone="warning"
            title="Records are archived, never deleted"
            detail="OPD retention norms require visit records to be kept. A deletion request archives the record and removes it from search instead."
          />
        </div>
      </Card>
    </div>
  );
}

function StaffTab({
  staff,
  currentStaffId,
}: {
  staff: StaffRow[];
  currentStaffId: string;
}) {
  const incompleteDoctor = staff.find(
    (s) => s.isDoctor && !s.registrationNo,
  );

  return (
    <>
      {incompleteDoctor ? (
        <div className="mb-4">
          <AlertBanner
            title={`${incompleteDoctor.name} cannot issue prescriptions`}
            detail="A state medical council registration number is required on every prescription. Add it to unblock."
          />
        </div>
      ) : null}

      <SectionLabel>Directory</SectionLabel>
      <div className="flex flex-col gap-3">
        {staff.map((member) => (
          <Card key={member.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                  {member.name}
                </h3>
                <p className="text-[14px] text-ink-secondary">
                  {member.qualification ?? "—"} · {member.phone}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {member.id === currentStaffId ? (
                  <StatusPill tone="accent">You</StatusPill>
                ) : null}
                <StatusPill tone={member.isActive ? "success" : "neutral"}>
                  {member.isActive ? "Active" : "Inactive"}
                </StatusPill>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {member.roles.map((role) => (
                <StatusPill
                  key={role}
                  tone={role === "owner" ? "accent" : "neutral"}
                >
                  {role.replace("_", " ")}
                </StatusPill>
              ))}
              {member.isDoctor && !member.registrationNo ? (
                <StatusPill tone="alert">No registration no.</StatusPill>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function AuditTab({ audit }: { audit: AuditEntry[] }) {
  return (
    <>
      <div className="mb-4">
        <AlertBanner
          tone="warning"
          title="Append-only record"
          detail="Every dispense, discount, override and record edit is attributed. Entries cannot be edited or deleted by anyone, including the owner."
        />
      </div>

      {audit.length === 0 ? (
        <EmptyState
          title="No activity yet"
          hint="Every action that touches a patient, stock or money is recorded here automatically."
        />
      ) : (
        <GroupedList>
          {audit.map((entry) => {
            const described = describeAudit(entry.action, entry.detail);
            return (
              <Row
                key={entry.id}
                leading={
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      described.tone === "alert"
                        ? "bg-alert"
                        : described.tone === "warning"
                          ? "bg-warning"
                          : "bg-ink-secondary/40",
                    )}
                  />
                }
                title={`${described.title}${entry.actorName ? ` — ${entry.actorName}` : ""}`}
                subtitle={described.detail}
                trailing={
                  <span className="tabular text-[13px] font-semibold text-ink-secondary">
                    {formatTime(entry.at)}
                  </span>
                }
              />
            );
          })}
        </GroupedList>
      )}
    </>
  );
}

/** ISO → "14:04" in clinic-local time. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
        {label}
      </dt>
      <dd className="text-[15px] text-ink">{value}</dd>
    </div>
  );
}
