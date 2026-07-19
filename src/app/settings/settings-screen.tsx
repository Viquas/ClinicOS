"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, GroupedList, Row, SectionLabel } from "@/components/ui/card";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import type { StaffRow } from "@/db/queries/staff";
import { describeAudit } from "@/lib/audit/describe";
import type { StaffRole } from "@/lib/auth/claims";
import { SPECIALTY_REGISTRY } from "@/lib/clinical/specialties";
import { clinic } from "@/lib/mock/data";
import {
  getServerTheme,
  getStoredTheme,
  setStoredTheme,
  subscribeTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import {
  addStaffAction,
  setStaffActiveAction,
  updateStaffRolesAction,
} from "./actions";

type AuditEntry = {
  id: string;
  at: string;
  actorName: string | null;
  action: string;
  detail: unknown;
};

type LastChange = { byName: string | null; at: string; reason: string } | null;

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
  currentStaffRoles,
  lastChangeByStaffId,
  audit,
}: {
  staff: StaffRow[];
  currentStaffId: string;
  currentStaffRoles: StaffRole[];
  lastChangeByStaffId: Record<string, LastChange>;
  audit: AuditEntry[];
}) {
  return (
    <>
      <ScreenHeader title="Settings" subtitle={clinic.name} />
      <Tabs
        staff={staff}
        currentStaffId={currentStaffId}
        currentStaffRoles={currentStaffRoles}
        lastChangeByStaffId={lastChangeByStaffId}
        audit={audit}
      />
    </>
  );
}

type Tab = "clinic" | "staff" | "audit";

function Tabs({
  staff,
  currentStaffId,
  currentStaffRoles,
  lastChangeByStaffId,
  audit,
}: {
  staff: StaffRow[];
  currentStaffId: string;
  currentStaffRoles: StaffRole[];
  lastChangeByStaffId: Record<string, LastChange>;
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
        <StaffTab
          staff={staff}
          currentStaffId={currentStaffId}
          isOwner={currentStaffRoles.includes("owner")}
          lastChangeByStaffId={lastChangeByStaffId}
        />
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

const ALL_ROLES: StaffRole[] = ["owner", "doctor", "front_desk", "nurse", "pharmacy"];
const SPECIALTIES = Object.keys(SPECIALTY_REGISTRY);

/**
 * Staff directory + role administration (§7.8, §7.12).
 *
 * The owner assigns roles per person — stacking included, so "nurse who also
 * dispenses" is checking one extra box, not creating a second login. Every
 * change demands a reason and lands in the revision + audit trail; the
 * invariants (last owner, no self-deactivation, doctor needs a specialty)
 * are enforced in the mutation, so this UI is convenience, not the guard.
 */
function StaffTab({
  staff,
  currentStaffId,
  isOwner,
  lastChangeByStaffId,
}: {
  staff: StaffRow[];
  currentStaffId: string;
  isOwner: boolean;
  lastChangeByStaffId: Record<string, LastChange>;
}) {
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [togglingActive, setTogglingActive] = useState<StaffRow | null>(null);
  const [adding, setAdding] = useState(false);

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

      {isOwner ? (
        <div className="mb-4 max-w-xs">
          <PrimaryButton onClick={() => setAdding(true)}>
            Add staff member
          </PrimaryButton>
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

            {lastChangeByStaffId[member.id] ? (
              <p className="mt-2 text-[12px] text-ink-secondary">
                Last changed by {lastChangeByStaffId[member.id]!.byName ?? "unknown"} on{" "}
                {lastChangeByStaffId[member.id]!.at} — {lastChangeByStaffId[member.id]!.reason}
              </p>
            ) : null}

            {isOwner ? (
              <div className="mt-3 flex items-center gap-4 border-t border-hairline pt-3">
                {member.isActive ? (
                  <button
                    onClick={() => setEditing(member)}
                    className="text-[13px] font-semibold text-accent"
                  >
                    Edit roles
                  </button>
                ) : null}
                {member.id !== currentStaffId ? (
                  <button
                    onClick={() => setTogglingActive(member)}
                    className="text-[13px] font-semibold text-ink-secondary"
                  >
                    {member.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {editing ? (
        <EditRolesDialog member={editing} onClose={() => setEditing(null)} />
      ) : null}
      {togglingActive ? (
        <ToggleActiveDialog
          member={togglingActive}
          onClose={() => setTogglingActive(null)}
        />
      ) : null}
      {adding ? <AddStaffDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function RoleCheckboxes({
  roles,
  onToggle,
}: {
  roles: StaffRole[];
  onToggle: (role: StaffRole) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_ROLES.map((role) => {
        const on = roles.includes(role);
        return (
          <button
            key={role}
            type="button"
            onClick={() => onToggle(role)}
            aria-pressed={on}
            className={cn(
              "min-h-[38px] rounded-[var(--radius-pill)] px-3.5 text-[14px] font-semibold",
              "transition-colors duration-150",
              on
                ? "bg-accent text-accent-ink"
                : "bg-surface-sunken text-ink-secondary",
            )}
          >
            {role.replace("_", " ")}
          </button>
        );
      })}
    </div>
  );
}

function SpecialtySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
        Specialty
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
      >
        {SPECIALTIES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function DialogShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog onClose={onClose}>
      <Card className="w-full max-w-md p-5">{children}</Card>
    </Dialog>
  );
}

function ReasonField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
        Reason
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none placeholder:text-ink-secondary/60"
      />
    </label>
  );
}

function EditRolesDialog({
  member,
  onClose,
}: {
  member: StaffRow;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>(member.roles as StaffRole[]);
  const [specialty, setSpecialty] = useState(member.specialty ?? SPECIALTIES[0]);
  const [reason, setReason] = useState("");

  /* The specialty question only exists when doctor is being granted to
     someone who has never had a doctors row. */
  const needsSpecialty =
    roles.includes("doctor") && !member.roles.includes("doctor") && !member.specialty;

  const toggle = (role: StaffRole) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateStaffRolesAction({
        staffId: member.id,
        roles,
        reason,
        specialty: needsSpecialty ? specialty : undefined,
      });
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <DialogShell onClose={onClose}>
      <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
        Roles for {member.name}
      </DialogTitle>
      <p className="mt-1 text-[14px] text-ink-secondary">
        Roles stack — a nurse who also runs the pharmacy holds both. The
        change is recorded with who made it and why.
      </p>

      {error ? (
        <div className="mt-3">
          <AlertBanner title={error} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <RoleCheckboxes roles={roles} onToggle={toggle} />
        {needsSpecialty ? (
          <SpecialtySelect value={specialty} onChange={setSpecialty} />
        ) : null}
        <ReasonField
          value={reason}
          onChange={setReason}
          placeholder="e.g. Latha covers dispensing on evening shifts"
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <div className="flex-1">
          <PrimaryButton
            disabled={reason.trim().length < 4 || isPending}
            onClick={handleSave}
          >
            {isPending ? "Saving…" : "Save roles"}
          </PrimaryButton>
        </div>
      </div>
    </DialogShell>
  );
}

function ToggleActiveDialog({
  member,
  onClose,
}: {
  member: StaffRow;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const deactivating = member.isActive;

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await setStaffActiveAction({
        staffId: member.id,
        active: !member.isActive,
        reason,
      });
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <DialogShell onClose={onClose}>
      <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
        {deactivating ? "Deactivate" : "Reactivate"} {member.name}
      </DialogTitle>
      <p className="mt-1 text-[14px] text-ink-secondary">
        {deactivating
          ? "They stop appearing as available staff. Nothing is deleted — history keeps their name."
          : "They return to the active staff list with their previous roles."}
      </p>

      {error ? (
        <div className="mt-3">
          <AlertBanner title={error} />
        </div>
      ) : null}

      <div className="mt-4">
        <ReasonField
          value={reason}
          onChange={setReason}
          placeholder={deactivating ? "e.g. left the clinic in July" : "e.g. rejoined after leave"}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <div className="flex-1">
          <PrimaryButton
            tone={deactivating ? "neutral" : "accent"}
            disabled={reason.trim().length < 4 || isPending}
            onClick={handleSave}
          >
            {isPending ? "Saving…" : deactivating ? "Deactivate" : "Reactivate"}
          </PrimaryButton>
        </div>
      </div>
    </DialogShell>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [qualification, setQualification] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>(["front_desk"]);
  const [specialty, setSpecialty] = useState(SPECIALTIES[0]);

  const toggle = (role: StaffRole) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await addStaffAction({
        name,
        phone,
        roles,
        qualification: qualification.trim() || null,
        specialty: roles.includes("doctor") ? specialty : undefined,
      });
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <DialogShell onClose={onClose}>
      <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
        Add staff member
      </DialogTitle>
      <p className="mt-1 text-[14px] text-ink-secondary">
        Creates the staff record. Their device login is set up separately.
      </p>

      {error ? (
        <div className="mt-3">
          <AlertBanner title={error} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
            Phone
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
            Qualification (optional)
          </span>
          <input
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3 text-[16px] text-ink outline-none"
          />
        </label>
        <RoleCheckboxes roles={roles} onToggle={toggle} />
        {roles.includes("doctor") ? (
          <SpecialtySelect value={specialty} onChange={setSpecialty} />
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <div className="flex-1">
          <PrimaryButton
            disabled={
              isPending ||
              name.trim().length < 2 ||
              phone.replace(/\D/g, "").length !== 10 ||
              roles.length === 0
            }
            onClick={handleSave}
          >
            {isPending ? "Adding…" : "Add staff member"}
          </PrimaryButton>
        </div>
      </div>
    </DialogShell>
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
